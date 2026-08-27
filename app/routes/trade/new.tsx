import { useState } from "react";
import { useLoaderData, useNavigate, useSubmit, redirect } from "react-router";
import { NavBar, Input, TextArea, Button, Toast } from "antd-mobile";
import clsx from "clsx";
import { createTrade, fetchItems } from "../../api/trading";
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
            <NavBar onBack={() => navigate(-1)} className={styles.navBar}>
                新增记录
            </NavBar>

            <div className={styles.content}>

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
                                    onClick={() => setSelectedItemId(item.id)}
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

                <div className={styles.formRows}>
                    <FormRow label="当前价 *" value={currentPrice} onChange={setCurrentPrice} placeholder="0.00" />
                    <FormRow label="预期价 *" value={targetPrice} onChange={setTargetPrice} placeholder="0.00" />
                    <FormRow label="止损价 *" value={stopLossPrice} onChange={setStopLossPrice} placeholder="0.00" />
                    <FormRow label="买入数量 *" value={buyQuantity} onChange={setBuyQuantity} placeholder="0" />
                </div>

                {/* 3. 实时计算收益分析面板 */}
                {(upside !== null || downside !== null || rewardRisk !== null) && (
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
                <div className={styles.notesBox}>
                    <TextArea
                        placeholder="记录你的想法和买入逻辑..."
                        value={notes}
                        onChange={setNotes}
                        autoSize={{ minRows: 4, maxRows: 8 }}
                        className={styles.field}
                    />
                </div>
            </div>

            {/* 底部保存按钮 */}
            <div className={styles.actionBar}>
                <Button block onClick={handleSave} className={styles.saveButton}>
                    保存记录
                </Button>
            </div>
        </div>
    );
}

// 辅助子组件：输入行
function FormRow({ label, value, onChange, placeholder }: { label: string, value: string, onChange: (v: string) => void, placeholder: string }) {
    return (
        <div>
            <div className={styles.fieldLabel}>{label}</div>
            <div className={styles.fieldBox}>
                <Input
                    type="number"
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    className={styles.field}
                />
            </div>
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
