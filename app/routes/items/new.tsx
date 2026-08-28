import { useState, useEffect } from "react";
import { useNavigate, useFetcher, Form, redirect, useActionData} from "react-router";
import { NavBar, Button, List, Input, Toast } from "antd-mobile";
import { Search } from "lucide-react";
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

    if (!name || !symbol) {
        return { error: "数据不完整" };
    }

    try {
        await createItem({
            name,
            symbol,
            description: (formData.get("description") as string) || "",
            exchange: (formData.get("exchange") as string) || "",
        });
        return redirect("/items/manage");
    } catch (error: any) {
        // 例如重复添加同一标的，交给前端 Toast 展示
        return { error: error.message as string };
    }
}

// ==========================================
// 2. 客户端 UI 组件
// ==========================================
export default function NewItemRoute() {
    const navigate = useNavigate();
    const fetcher = useFetcher<typeof clientLoader>();

    const [inputValue, setInputValue] = useState("");
    const [selectedStock, setSelectedStock] = useState<any>(null);
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
    }, [inputValue, selectedStock]);

    const handleSelect = (stock: any) => {
        setSelectedStock(stock);
        setInputValue(stock.symbol);
    };

    const handleSave = (e: React.MouseEvent) => {
        if (!selectedStock) {
            e.preventDefault();
            Toast.show({ icon: 'fail', content: '请先从搜索结果中选择股票' });
        }
    };

    const results = fetcher.data?.results || [];
    const isSearching = fetcher.state === "loading";

    return (
        <div className={styles.page}>
            {/* 与保存成功后的 redirect 保持一致：取消和保存都回条目管理，不要一个回列表一个回首页 */}
            <NavBar onBack={() => navigate("/items/manage", { replace: true })} className={styles.navBar}>
                新增条目
            </NavBar>

            <div className={styles.content}>
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

                {selectedStock && (
                    <div className={styles.selectedHint}>
                        已选择：{selectedStock.symbol} · {selectedStock.description}
                    </div>
                )}
            </div>

            <Form method="post" className={styles.actionBar}>
                <input type="hidden" name="name" value={selectedStock?.symbol || ""} />
                <input type="hidden" name="symbol" value={selectedStock?.symbol || ""} />
                <input type="hidden" name="description" value={selectedStock?.description || ""} />
                <input type="hidden" name="exchange" value={selectedStock?.exchange || ""} />

                <Button
                    type="submit"
                    block
                    className={clsx(styles.saveButton, !selectedStock && styles.saveButtonDisabled)}
                    onClick={handleSave}
                >
                    保存条目
                </Button>
            </Form>
        </div>
    );
}
