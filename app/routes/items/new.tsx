import { useState, useEffect } from "react";
import { useNavigate, useFetcher, Form, redirect } from "react-router";
import { NavBar, Button, List, Input, Toast } from "antd-mobile";
import { Search } from "lucide-react";
import { TradingDB } from "../../server/db/client.server";

// ==========================================
// 1. 服务端逻辑 (运行在 Cloudflare Worker)
// ==========================================

// Loader: 处理股票实时搜索
export async function loader({ request }: { request: Request }) {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");

    if (!q || q.length < 2) {
        return { results: [] };
    }

    // 原代码中的 API Key，现在移到服务端更加安全
    const apiKey = 'da2gbppr01qmq2q9sh7gda2gbppr01qmq2q9sh80';

    try {
        const response = await fetch(`https://finnhub.io/api/v1/search?q=${q}&exchange=US&token=${apiKey}`);
        const data = await response.json() as any;

        const results = (data.result || []).map((item: any) => ({
            symbol: item.symbol || item.displaySymbol || '',
            description: item.description || '',
            exchange: item.exchange || 'US',
            type: item.type || '',
        })).filter((item: any) => item.symbol);

        return { results: results.slice(0, 8) };
    } catch (error) {
        console.error("股票查询失败:", error);
        return { results: [] };
    }
}

// Action: 处理表单提交，存入 D1 数据库
export async function action({ request, context }: { request: Request, context: any }) {
    const formData = await request.formData();
    const name = formData.get("name") as string;
    const symbol = formData.get("symbol") as string;
    const description = formData.get("description") as string;
    const exchange = formData.get("exchange") as string;

    if (!name || !symbol) {
        return { error: "数据不完整" };
    }

    // 连接 D1 数据库并保存
    const db = new TradingDB(context.cloudflare.env.DB);
    await db.createItem({ name, symbol, description, exchange });

    // 保存成功后重定向回管理页
    return redirect("/items/manage");
}

// ==========================================
// 2. 客户端 UI 组件
// ==========================================

export default function NewItemRoute() {
    const navigate = useNavigate();
    const fetcher = useFetcher<typeof loader>(); // 用于调用同文件内的 loader

    const [inputValue, setInputValue] = useState("");
    const [selectedStock, setSelectedStock] = useState<any>(null);

    // 防抖搜索逻辑
    useEffect(() => {
        const query = inputValue.trim();

        // 如果输入框的值与已选中的股票代码不同，则清除选中状态
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
            // 调用本路由的 loader 接口，自动带上 ?q= 参数
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

                {/* 搜索输入框 */}
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

                {/* 搜索结果列表 */}
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

                {/* 已选择状态提示 */}
                {selectedStock && (
                    <div style={{ marginTop: '16px', color: '#00E676', fontSize: '14px' }}>
                        已选择：{selectedStock.symbol} · {selectedStock.description}
                    </div>
                )}
            </div>

            {/* 底部保存表单与按钮 */}
            <Form method="post" style={{ padding: '16px 24px', borderTop: '1px solid #1A1C24', paddingBottom: 'env(safe-area-inset-bottom)' }}>
                {/* 隐藏的 input，用于将选中的数据通过 Form 提交给 Action */}
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
