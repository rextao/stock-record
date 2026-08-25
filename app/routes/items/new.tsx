import { useState, useEffect } from "react";
import { useNavigate, useFetcher, Form, redirect, useActionData} from "react-router";
import { NavBar, Button, List, Input, Toast } from "antd-mobile";
import { Search } from "lucide-react";
import { TradingDB } from "~/server/db/client.server";
import { getStockProvider } from "~/server/services/stock";

// ==========================================
// 1. 服务端逻辑
// ==========================================
export async function loader({ request, context }: { request: Request, context: any }) {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");

    if (!q || q.length < 2) {
        return { results: [] };
    }

    // 通过服务工厂获取股票查询实现
    const stockService = getStockProvider(context.cloudflare.env);

    try {
        const results = await stockService.search(q);
        return { results };
    } catch (error: any) {
        // 捕获 API Key 缺失错误，通知前端
        if (error.message === "MISSING_API_KEY") {
            return { results: [], error: "未配置行情接口凭证，无法搜索股票" };
        }
        return { results: [], error: "获取数据失败，请稍后重试" };
    }
}

export async function action({ request, context }: { request: Request, context: any }) {
    const formData = await request.formData();
    const name = formData.get("name") as string;
    const symbol = formData.get("symbol") as string;
    const description = formData.get("description") as string;
    const exchange = formData.get("exchange") as string;

    if (!name || !symbol) {
        return { error: "数据不完整" };
    }

    const db = new TradingDB(context.cloudflare.env.DB);

    try {
        // 尝试保存
        await db.createItem({ name, symbol, description, exchange });
        return redirect("/items/manage");
    } catch (error: any) {
        // 拦截重复添加的抛错，返回给前端
        return { error: error.message };
    }
}

// ==========================================
// 2. 客户端 UI 组件
// ==========================================
export default function NewItemRoute() {
    const navigate = useNavigate();
    const fetcher = useFetcher<typeof loader>();

    const [inputValue, setInputValue] = useState("");
    const [selectedStock, setSelectedStock] = useState<any>(null);
    // 获取表单提交 (Action) 返回的数据
    const actionData = useActionData<typeof action>();
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
        <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#fff', display: 'flex', flexDirection: 'column' }}>
            <NavBar
                onBack={() => navigate(-1)}
                style={{ '--border-bottom': '1px solid #1A1C24', backgroundColor: '#000000' }}
            >
                新增条目
            </NavBar>

            <div style={{ padding: '16px', flex: 1 }}>
                <div style={{ fontSize: '14px', color: '#6D6F7E', marginBottom: '8px', letterSpacing: '1px' }}>
                    条目名称
                </div>

                <div style={{
                    backgroundColor: '#0B0C11',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    border: '1px solid #1A1C24',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <Search size={20} color="#6D6F7E" />
                    <Input
                        value={inputValue}
                        onChange={setInputValue}
                        placeholder="输入股票代码或名称"
                        style={{ '--color': '#fff' }}
                        clearable
                    />
                </div>

                {isSearching && (
                    <div style={{ marginTop: '12px', color: '#6D6F7E', fontSize: '14px' }}>搜索中...</div>
                )}

                {!selectedStock && results.length > 0 && (
                    <List
                        style={{
                            marginTop: '12px',
                            '--border-top': 'none', '--border-bottom': 'none',
                            '--border-inner': '1px solid #1A1C24',
                            borderRadius: '12px', overflow: 'hidden',
                            backgroundColor: '#0B0C11'
                        }}
                    >
                        {results.map((stock: any) => (
                            <List.Item
                                key={`${stock.symbol}-${stock.exchange}`}
                                onClick={() => handleSelect(stock)}
                                extra={<span style={{ color: '#6D6F7E', fontSize: '12px' }}>{stock.exchange}</span>}
                                style={{ '--active-background-color': '#1A1C24' }}
                            >
                                <div style={{ color: '#fff', fontSize: '16px', fontWeight: 500 }}>{stock.symbol}</div>
                                <div style={{ color: '#6D6F7E', fontSize: '12px', marginTop: '4px' }}>{stock.description}</div>
                            </List.Item>
                        ))}
                    </List>
                )}

                {selectedStock && (
                    <div style={{ marginTop: '16px', color: '#00E676', fontSize: '14px' }}>
                        已选择：{selectedStock.symbol} · {selectedStock.description}
                    </div>
                )}
            </div>

            <Form method="post" style={{ padding: '16px 24px', borderTop: '1px solid #1A1C24', paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <input type="hidden" name="name" value={selectedStock?.symbol || ""} />
                <input type="hidden" name="symbol" value={selectedStock?.symbol || ""} />
                <input type="hidden" name="description" value={selectedStock?.description || ""} />
                <input type="hidden" name="exchange" value={selectedStock?.exchange || ""} />

                <Button
                    type="submit"
                    block
                    style={{
                        backgroundColor: selectedStock ? '#6C5CE7' : '#2A2C35',
                        color: selectedStock ? '#fff' : '#6D6F7E',
                        border: 'none',
                        borderRadius: '12px',
                        height: '44px',
                        fontSize: '16px',
                        fontWeight: 600
                    }}
                    onClick={handleSave}
                >
                    保存条目
                </Button>
            </Form>
        </div>
    );
}
