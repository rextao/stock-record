import { useState, useEffect } from "react";
import { useNavigate, useFetcher, Form, redirect, useActionData} from "react-router";
import { NavBar, Button, List, Input, Toast } from "antd-mobile";
import { PlusCircle, Search } from "lucide-react";
import clsx from "clsx";
import { createItem, searchStocks } from "~/api/trading";
import styles from "./new.module.less";

// ==========================================
// 1. 客户端数据逻辑（搜索走 fetcher.load，保存走 Form）
// ==========================================
export async function clientLoader({ request }: { request: Request }) {
    const q = new URL(request.url).searchParams.get("q");

    if (!q || q.length < 2) {
        return { results: [] as Awaited<ReturnType<typeof searchStocks>>["results"], error: undefined };
    }

    try {
        return await searchStocks(q, { signal: request.signal });
    } catch (error: any) {
        return { results: [], error: (error.message as string) || "获取数据失败，请稍后重试" };
    }
}

export async function clientAction({ request }: { request: Request }) {
    const formData = await request.formData();
    const name = formData.get("name") as string;
    const symbol = formData.get("symbol") as string;

    // 代码可以为空：自定义条目只要名称。留空时后端存 NULL，不去拉行情
    if (!name) {
        return { error: "请填写条目名称" };
    }

    try {
        await createItem({
            name,
            symbol: symbol || "",
            description: (formData.get("description") as string) || "",
            exchange: (formData.get("exchange") as string) || "",
        });
        return redirect("/items/manage");
    } catch (error: any) {
        // 例如重复添加同一标的，交给前端 Toast 展示
        return { error: error.message as string };
    }
}

// 看起来像股票代码就顺手带进自定义表单的代码字段，中文名之类的留空
const TICKER_PATTERN = /^[A-Za-z0-9.\-]{1,12}$/;

// ==========================================
// 2. 客户端 UI 组件
// ==========================================
export default function NewItemRoute() {
    const navigate = useNavigate();
    const fetcher = useFetcher<typeof clientLoader>();

    const [inputValue, setInputValue] = useState("");
    const [selectedStock, setSelectedStock] = useState<any>(null);
    // 非空即处于自定义模式：搜不到的标的手动登记，代码可以留空
    const [custom, setCustom] = useState<{ name: string; symbol: string } | null>(null);
    // 获取表单提交 (Action) 返回的数据
    const actionData = useActionData<typeof clientAction>();
    // 提取错误信息
    const errorMsg = fetcher.data?.error;

    // 监听 actionData，如果有 error 就弹出提示
    useEffect(() => {
        if (actionData?.error) {
            Toast.show({ icon: 'fail', content: actionData.error });
        }
    }, [actionData]);

    // 防抖搜索逻辑
    useEffect(() => {
        // 自定义模式下不再打搜索接口
        if (custom) return;

        const query = inputValue.trim();

        if (selectedStock && selectedStock.symbol !== query) {
            setSelectedStock(null);
        }

        if (query.length < 2) {
            return;
        }
        if (selectedStock?.symbol === query) {
            return;
        }

        const timer = setTimeout(() => {
            fetcher.load(`/items/new?q=${encodeURIComponent(query)}`);
        }, 350);

        return () => clearTimeout(timer);
    }, [inputValue, selectedStock, custom]);

    const handleSelect = (stock: any) => {
        setSelectedStock(stock);
        setInputValue(stock.symbol);
    };

    const results = fetcher.data?.results || [];
    const isSearching = fetcher.state === "loading";
    const query = inputValue.trim();
    // 搜过一轮、确实没结果（或接口异常）才给自定义入口，避免刚打一个字就冒出来
    const canFallback =
        !custom && !selectedStock && !isSearching && query.length > 0 && results.length === 0;

    const enterCustom = () => {
        setCustom({ name: query, symbol: TICKER_PATTERN.test(query) ? query.toUpperCase() : "" });
        setSelectedStock(null);
    };

    const customName = custom?.name.trim() || "";
    const customSymbol = custom?.symbol.trim().toUpperCase() || "";
    const canSave = custom ? customName.length > 0 : !!selectedStock;

    const handleSave = (e: React.MouseEvent) => {
        if (canSave) return;
        e.preventDefault();
        Toast.show({
            icon: 'fail',
            content: custom ? '请填写条目名称' : '请先从搜索结果中选择股票',
        });
    };

    return (
        <div className={styles.page}>
            {/* 与保存成功后的 redirect 保持一致：取消和保存都回条目管理，不要一个回列表一个回首页 */}
            <NavBar onBack={() => navigate("/items/manage", { replace: true })} className={styles.navBar}>
                新增条目
            </NavBar>

            <div className={styles.content}>
                {custom ? (
                    <>
                        <div className={styles.fieldLabel}>条目名称</div>
                        <div className={styles.searchBox}>
                            <Input
                                value={custom.name}
                                onChange={(value) => setCustom({ ...custom, name: value })}
                                placeholder="例如 贵州茅台"
                                className={styles.searchInput}
                                clearable
                            />
                        </div>

                        <div className={clsx(styles.fieldLabel, styles.fieldLabelGap)}>股票代码（可选）</div>
                        <div className={styles.searchBox}>
                            <Input
                                value={custom.symbol}
                                onChange={(value) => setCustom({ ...custom, symbol: value })}
                                placeholder="留空则不拉行情"
                                className={styles.searchInput}
                                clearable
                            />
                        </div>

                        <div className={styles.customTip}>
                            填了代码就会照常拉现价和走势（搜索搜不到不代表行情拉不到）；留空的条目现价显示
                            --，盈亏只按你登记的买卖价算。
                        </div>

                        <button type="button" className={styles.linkButton} onClick={() => setCustom(null)}>
                            返回搜索
                        </button>
                    </>
                ) : (
                    <>
                        <div className={styles.fieldLabel}>条目名称</div>

                        <div className={styles.searchBox}>
                            <span className={styles.searchIcon}>
                                <Search size={20} />
                            </span>
                            <Input
                                value={inputValue}
                                onChange={setInputValue}
                                placeholder="输入股票代码或名称"
                                className={styles.searchInput}
                                clearable
                            />
                        </div>

                        {isSearching && (
                            <div className={styles.searching}>搜索中...</div>
                        )}

                        {!selectedStock && results.length > 0 && (
                            <List className={styles.resultList}>
                                {results.map((stock: any) => (
                                    <List.Item
                                        key={`${stock.symbol}-${stock.exchange}`}
                                        onClick={() => handleSelect(stock)}
                                        extra={<span className={styles.resultExchange}>{stock.exchange}</span>}
                                        className={styles.resultItem}
                                    >
                                        <div className={styles.resultSymbol}>{stock.symbol}</div>
                                        <div className={styles.resultDesc}>{stock.description}</div>
                                    </List.Item>
                                ))}
                            </List>
                        )}

                        {/* 搜索接口异常（含未配凭证的 503）也走这里，跟「没搜到」共用一个出口 */}
                        {canFallback && (
                            <div className={styles.fallback}>
                                <span className={styles.fallbackText}>
                                    {errorMsg || `没搜到「${query}」`}
                                </span>
                                <button type="button" className={styles.linkButton} onClick={enterCustom}>
                                    <PlusCircle size={14} />
                                    自定义添加
                                </button>
                            </div>
                        )}

                        {selectedStock && (
                            <div className={styles.selectedHint}>
                                已选择：{selectedStock.symbol} · {selectedStock.description}
                            </div>
                        )}
                    </>
                )}
            </div>

            <Form method="post" className={styles.actionBar}>
                <input type="hidden" name="name" value={custom ? customName : selectedStock?.symbol || ""} />
                <input type="hidden" name="symbol" value={custom ? customSymbol : selectedStock?.symbol || ""} />
                <input
                    type="hidden"
                    name="description"
                    value={custom ? customName : selectedStock?.description || ""}
                />
                {/* exchange 记 CUSTOM，以后要区分「手动登记」和「搜索来的」有据可依 */}
                <input
                    type="hidden"
                    name="exchange"
                    value={custom ? "CUSTOM" : selectedStock?.exchange || ""}
                />

                <Button
                    type="submit"
                    block
                    className={clsx(styles.saveButton, !canSave && styles.saveButtonDisabled)}
                    onClick={handleSave}
                >
                    保存条目
                </Button>
            </Form>
        </div>
    );
}
