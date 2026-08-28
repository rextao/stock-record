import { useEffect, useRef, useState } from "react";
import { useLoaderData, useNavigate, useSubmit, redirect } from "react-router";
import { NavBar, Button, Toast } from "antd-mobile";
import clsx from "clsx";
import { createTrade, fetchItems } from "../../api/trading";
import NumericKeypad, { NUMERIC_KEYPAD_ID } from "../../common/components/NumericKeypad";
import PlainTextArea from "../../common/components/PlainTextArea";
import { sanitizeDecimalInput, sanitizeIntegerInput } from "../../utils/numberInput";
import styles from "./new.module.less";

// ==========================================
// 1. 客户端数据逻辑
// ==========================================
export async function clientLoader({ request }: { request: Request }) {
    // 加载用户已经创建的所有标的（items）供选择
    return fetchItems({ signal: request.signal });
}

export async function clientAction({ request }: { request: Request }) {
    const formData = await request.formData();

    const itemId = Number(formData.get("itemId"));
    const currentPrice = Number(formData.get("currentPrice"));
    const targetPrice = Number(formData.get("targetPrice"));
    const stopLossPrice = Number(formData.get("stopLossPrice"));
    const buyQuantity = Number(formData.get("buyQuantity"));
    const notes = (formData.get("notes") as string) || "";

    if (!itemId || !currentPrice || !targetPrice || !stopLossPrice || !buyQuantity) {
        return { error: "核心数据不完整" };
    }

    try {
        await createTrade({
            itemId,
            currentPrice,
            targetPrice,
            stopLossPrice,
            buyQuantity,
            notes: notes.trim() || undefined,
        });
    } catch (error: any) {
        return { error: error.message as string };
    }

    // 录入成功后，回到首页看盘
    return redirect("/");
}

// ==========================================
// 2. 客户端工具与组件
// ==========================================

// 格式化辅助函数
const formatPct = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;

type Tone = 'default' | 'up' | 'down';

const toneClass = (tone: Tone) => (tone === 'up' ? styles.up : tone === 'down' ? styles.down : undefined);

export default function NewTradeRoute() {
    const { items } = useLoaderData<typeof clientLoader>();
    const navigate = useNavigate();
    const submit = useSubmit();

    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [currentPrice, setCurrentPrice] = useState("");
    const [targetPrice, setTargetPrice] = useState("");
    const [stopLossPrice, setStopLossPrice] = useState("");
    const [buyQuantity, setBuyQuantity] = useState("");
    const [notes, setNotes] = useState("");

    /*
     * 价格区的四个格子刻意不使用原生输入框的焦点，改成「button 显示值 + 自绘数字键盘」。
     * 原因见 NumericKeypad 的注释：iOS 只要 input 拿到焦点就必然出现无法隐藏的表单辅助条，
     * 而且软键盘每次弹出收起都会改写 visualViewport，聚焦瞬间页面一定抖。
     */
    const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    // 备注是自由文本，只能走系统键盘（辅助条另见 PlainTextArea），所以要单独处理「聚焦后被键盘盖住」
    const contentRef = useRef<HTMLDivElement | null>(null);
    const notesRef = useRef<HTMLDivElement | null>(null);
    const [notesFocused, setNotesFocused] = useState(false);

    // 顺序即键盘上「上一项 / 下一项」的顺序；备注是自由文本，走系统键盘，刻意不进这个序列
    const priceFields = [
        { label: "当前价", value: currentPrice, onChange: setCurrentPrice, kind: "decimal" as const },
        { label: "预期价", value: targetPrice, onChange: setTargetPrice, kind: "decimal" as const },
        { label: "止损价", value: stopLossPrice, onChange: setStopLossPrice, kind: "decimal" as const },
        { label: "买入数量", value: buyQuantity, onChange: setBuyQuantity, kind: "integer" as const },
    ];

    const activeField = activeIndex === null ? null : priceFields[activeIndex];

    const selectField = (index: number) => {
        setActiveIndex(index);
        /*
         * 键盘是页面内的固定面板，不改变视口高度，所以只需要在格子真被它盖住时滚一下，
         * 且用 nearest 取最小位移：2×2 网格里同一行两格纵向位置相同，无条件居中会白白拽动页面。
         */
        requestAnimationFrame(() => {
            const el = cellRefs.current[index];
            if (!el) return;
            const keypadHeight = document.getElementById(NUMERIC_KEYPAD_ID)?.offsetHeight ?? 0;
            const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
            const rect = el.getBoundingClientRect();
            if (rect.bottom > viewportHeight - keypadHeight || rect.top < 0) {
                el.scrollIntoView({ block: "nearest" });
            }
        });
    };

    const handleKeyInput = (char: string) => {
        if (!activeField) return;
        const isInteger = activeField.kind === "integer";
        const maxLength = isInteger ? 8 : 7;
        // 小数点打头补个 0，否则会显示成 ".5" 这种别扭的中间态
        const raw = char === "." && activeField.value === "" ? "0." : activeField.value + char;
        const next = isInteger ? sanitizeIntegerInput(raw) : sanitizeDecimalInput(raw);
        if (next === activeField.value || next.length > maxLength) return;
        activeField.onChange(next);
    };

    const handleBackspace = () => {
        if (!activeField) return;
        activeField.onChange(activeField.value.slice(0, -1));
    };

    /*
     * 备注聚焦后要一直盯着它，别只对齐一次。
     *
     * 两个坑：一是 onFocus 那一刻 visualViewport 还是键盘出现前的高度，量出来必然是错的；
     * 二是键盘弹出是一段动画，visualViewport 会分多帧收缩，只在第一次 resize 时对齐，
     * 后续几帧又会把备注框重新挤下去 —— 表现就是「看起来完全没生效」。
     * 所以整个聚焦期间都挂着监听，每次视口变化都重新对齐，另外补几个定时兜底
     *（Android 上偶尔不触发 resize）。
     *
     * 参照物取滚动容器自己的下边缘，而不是 visualViewport：外壳高度本来就跟着可视视口，
     * 容器下沿就是真实可见底部，这样不用去纠结 offsetTop 那套坐标换算。
     */
    useEffect(() => {
        if (!notesFocused) return;

        const align = () => {
            const container = contentRef.current;
            const el = notesRef.current;
            if (!container || !el) return;
            const box = el.getBoundingClientRect();
            const view = container.getBoundingClientRect();
            const gap = 12;
            if (box.bottom > view.bottom - gap) {
                container.scrollTop += box.bottom - view.bottom + gap;
            } else if (box.top < view.top + gap) {
                container.scrollTop -= view.top + gap - box.top;
            }
        };

        const viewport = window.visualViewport;
        viewport?.addEventListener("resize", align);
        const timers = [0, 120, 280, 500].map((delay) => window.setTimeout(align, delay));

        return () => {
            viewport?.removeEventListener("resize", align);
            timers.forEach(window.clearTimeout);
        };
    }, [notesFocused]);

    // 实时衍生计算逻辑
    const current = parseFloat(currentPrice) || 0;
    const target = parseFloat(targetPrice) || 0;
    const stopLoss = parseFloat(stopLossPrice) || 0;

    const upside = (current > 0 && target > 0) ? ((target - current) / current) * 100 : null;
    const downside = (current > 0 && stopLoss > 0) ? ((current - stopLoss) / current) * 100 : null;
    let rewardRisk: string | null = null;

    if (current > 0 && target > 0 && stopLoss > 0) {
        const expectedProfit = target - current;
        const expectedLoss = current - stopLoss;
        if (expectedLoss <= 0) {
            rewardRisk = expectedProfit <= 0 ? '--' : '∞：1';
        } else {
            rewardRisk = `${(expectedProfit / expectedLoss).toFixed(2)}：1`;
        }
    }

    const hasMetrics = upside !== null || downside !== null || rewardRisk !== null;

    // 提交处理
    const handleSave = () => {
        if (!selectedItemId) {
            Toast.show("请选择标的条目");
            return;
        }
        if (!current || !target || !stopLoss) {
            Toast.show("请填写完整的价格信息");
            return;
        }
        if (!buyQuantity || parseFloat(buyQuantity) <= 0) {
            Toast.show("请输入买入数量");
            return;
        }

        // 组装 formData 交给 action 处理
        submit(
            {
                itemId: String(selectedItemId),
                currentPrice,
                targetPrice,
                stopLossPrice,
                buyQuantity,
                notes
            },
            { method: "post" }
        );
    };

    return (
        <div className={styles.page}>
            {/* 入口只有首页的 + 号，直接回首页；replace 避免退回来又落在这张填了一半的表单上 */}
            <NavBar onBack={() => navigate("/", { replace: true })} className={styles.navBar}>
                新增记录
            </NavBar>

            <div
                ref={contentRef}
                className={clsx(
                    styles.content,
                    activeIndex !== null && styles.contentKeypadOpen,
                )}
                onPointerDownCapture={(e) => {
                    // 点到价格格子以外的任何地方都收起键盘；格子自己的处理器负责切换字段
                    if ((e.target as HTMLElement).closest("[data-keypad-cell]")) return;
                    if (activeIndex !== null) setActiveIndex(null);
                }}
            >

                {/* 1. 选择条目 */}
                <div className={styles.sectionTitle}>选择条目</div>
                {items.length === 0 ? (
                    <div className={styles.emptyItems}>
                        暂无条目，请先在「我的」中添加
                    </div>
                ) : (
                    <div className={styles.itemChips}>
                        {items.map((item: any) => {
                            const isSelected = selectedItemId === item.id;
                            return (
                                <div
                                    key={item.id}
                                    onClick={() => {
                                        setSelectedItemId(item.id);
                                        // 选完条目下一步必然是填价格，顺手把键盘带起来
                                        if (!isSelected) selectField(0);
                                    }}
                                    className={clsx(styles.itemChip, isSelected && styles.itemChipActive)}
                                >
                                    {item.name}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* 2. 价格与数量信息 */}
                <div className={clsx(styles.sectionTitle, styles.sectionTitleSpaced)}>价格信息</div>

                <div className={styles.priceGrid}>
                    {priceFields.map((field, index) => {
                        const isInteger = field.kind === "integer";
                        const isActive = activeIndex === index;
                        return (
                            <button
                                key={field.label}
                                type="button"
                                data-keypad-cell="true"
                                ref={(el) => {
                                    cellRefs.current[index] = el;
                                }}
                                className={clsx(styles.gridCell, isActive && styles.gridCellActive)}
                                aria-label={`${field.label} ${field.value || "未填写"}`}
                                onPointerDown={(e) => {
                                    // 不让默认行为把焦点交给按钮，避免点击时页面被 iOS 拽动
                                    e.preventDefault();
                                    selectField(index);
                                }}
                            >
                                <span className={styles.cellLabel}>
                                    {field.label}
                                    <span className={styles.cellRequired}>*</span>
                                </span>
                                <span className={styles.cellValue}>
                                    {field.value || (
                                        <span className={styles.cellPlaceholder}>{isInteger ? "0" : "0.00"}</span>
                                    )}
                                    {isActive && <span className={styles.caret} aria-hidden="true" />}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* 3. 实时计算收益分析面板 */}
                {hasMetrics && (
                    <div className={styles.calcPanel}>
                        {upside !== null && (
                            <CalcItem label="预期涨幅" value={formatPct(upside)} tone={upside >= 0 ? 'up' : 'down'} />
                        )}
                        {downside !== null && (
                            <CalcItem label="预期跌幅" value={formatPct(-downside)} tone="down" />
                        )}
                        {rewardRisk !== null && (
                            <CalcItem label="盈亏比" value={rewardRisk} />
                        )}
                    </div>
                )}

                {/* 4. 备注 */}
                <div className={clsx(styles.sectionTitle, styles.sectionTitleSpaced)}>备注</div>
                <div className={styles.notesBox} ref={notesRef}>
                    <PlainTextArea
                        placeholder="记录你的想法和买入逻辑..."
                        ariaLabel="备注"
                        value={notes}
                        onChange={setNotes}
                        onFocus={() => {
                            setNotesFocused(true);
                            setActiveIndex(null);
                        }}
                        onBlur={() => setNotesFocused(false)}
                    />
                </div>
            </div>

            {/* 底部保存按钮。键盘弹起时让位给输入工具条，否则两条会叠在一起 */}
            {activeIndex === null && !notesFocused && (
                <div className={styles.actionBar}>
                    <Button block onClick={handleSave} className={styles.saveButton}>
                        保存记录
                    </Button>
                </div>
            )}

            {/* 自绘数字键盘：它会挡住下面的计算面板，关键指标搬到顶排实时显示 */}
            <NumericKeypad
                visible={activeIndex !== null}
                allowDecimal={activeField?.kind !== "integer"}
                canPrev={activeIndex !== null && activeIndex > 0}
                canNext={activeIndex !== null && activeIndex < priceFields.length - 1}
                onInput={handleKeyInput}
                onBackspace={handleBackspace}
                onPrev={() => activeIndex !== null && selectField(activeIndex - 1)}
                onNext={() => activeIndex !== null && selectField(activeIndex + 1)}
                onDone={() => setActiveIndex(null)}
            >
                {hasMetrics && (
                    <>
                        {upside !== null && (
                            <span className={styles.barMetric}>
                                预期涨幅
                                <b className={clsx(styles.barMetricValue, toneClass(upside >= 0 ? 'up' : 'down'))}>
                                    {formatPct(upside)}
                                </b>
                            </span>
                        )}
                        {downside !== null && (
                            <span className={styles.barMetric}>
                                预期跌幅
                                <b className={clsx(styles.barMetricValue, styles.down)}>
                                    {formatPct(-downside)}
                                </b>
                            </span>
                        )}
                        {rewardRisk !== null && (
                            <span className={styles.barMetric}>
                                盈亏比
                                <b className={styles.barMetricValue}>{rewardRisk}</b>
                            </span>
                        )}
                    </>
                )}
            </NumericKeypad>
        </div>
    );
}

// 辅助子组件：计算结果项
function CalcItem({ label, value, tone = 'default' }: { label: string; value: string; tone?: Tone }) {
    return (
        <div className={styles.calcItem}>
            <span className={styles.calcLabel}>{label}</span>
            <span className={clsx(styles.calcValue, toneClass(tone))}>{value}</span>
        </div>
    );
}
