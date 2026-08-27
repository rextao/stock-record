import { useState } from "react";
import { useLoaderData, useNavigate, useSubmit, redirect } from "react-router";
import { NavBar, Input, TextArea, Button, Toast } from "antd-mobile";
import { createTrade, fetchItems } from "../../api/trading";

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
        <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#fff', display: 'flex', flexDirection: 'column' }}>
            <NavBar
                onBack={() => navigate(-1)}
                style={{ '--border-bottom': '1px solid #1A1C24', backgroundColor: '#000000' }}
            >
                新增记录
            </NavBar>

            <div style={{ padding: '16px', flex: 1, paddingBottom: '120px' }}>

                {/* 1. 选择条目 */}
                <div style={{ fontSize: '14px', color: '#6D6F7E', marginBottom: '12px' }}>选择条目</div>
                {items.length === 0 ? (
                    <div style={{ backgroundColor: '#0B0C11', border: '1px solid #1A1C24', borderRadius: '12px', padding: '16px', textAlign: 'center', color: '#6D6F7E' }}>
                        暂无条目，请先在「我的」中添加
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {items.map((item: any) => {
                            const isSelected = selectedItemId === item.id;
                            return (
                                <div
                                    key={item.id}
                                    onClick={() => setSelectedItemId(item.id)}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '20px',
                                        border: `1px solid ${isSelected ? '#6C5CE7' : '#1A1C24'}`,
                                        backgroundColor: isSelected ? '#6C5CE7' : '#0B0C11',
                                        color: isSelected ? '#fff' : '#F8F9FA',
                                        fontSize: '14px',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {item.name}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* 2. 价格与数量信息 */}
                <div style={{ fontSize: '14px', color: '#6D6F7E', marginTop: '32px', marginBottom: '12px' }}>价格信息</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <FormRow label="当前价 *" value={currentPrice} onChange={setCurrentPrice} placeholder="0.00" />
                    <FormRow label="预期价 *" value={targetPrice} onChange={setTargetPrice} placeholder="0.00" />
                    <FormRow label="止损价 *" value={stopLossPrice} onChange={setStopLossPrice} placeholder="0.00" />
                    <FormRow label="买入数量 *" value={buyQuantity} onChange={setBuyQuantity} placeholder="0" />
                </div>

                {/* 3. 实时计算收益分析面板 */}
                {(upside !== null || downside !== null || rewardRisk !== null) && (
                    <div style={{
                        display: 'flex', justifyContent: 'space-around',
                        backgroundColor: '#0B0C11', border: '1px solid #1A1C24', borderRadius: '12px',
                        padding: '16px', marginTop: '16px'
                    }}>
                        {upside !== null && (
                            <CalcItem label="预期涨幅" value={formatPct(upside)} color={upside >= 0 ? '#FF5252' : '#00E676'} />
                        )}
                        {downside !== null && (
                            <CalcItem label="预期跌幅" value={formatPct(-downside)} color="#00E676" />
                        )}
                        {rewardRisk !== null && (
                            <CalcItem label="盈亏比" value={rewardRisk} color="#F8F9FA" />
                        )}
                    </div>
                )}

                {/* 4. 备注 */}
                <div style={{ fontSize: '14px', color: '#6D6F7E', marginTop: '32px', marginBottom: '12px' }}>备注</div>
                <div style={{ backgroundColor: '#0B0C11', borderRadius: '12px', border: '1px solid #1A1C24', padding: '12px 16px' }}>
                    <TextArea
                        placeholder="记录你的想法和买入逻辑..."
                        value={notes}
                        onChange={setNotes}
                        autoSize={{ minRows: 4, maxRows: 8 }}
                        style={{ '--color': '#F8F9FA', '--font-size': '16px' }}
                    />
                </div>
            </div>

            {/* 底部保存按钮 */}
            <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                padding: '16px 24px calc(16px + env(safe-area-inset-bottom))',
                backgroundColor: '#000000', borderTop: '1px solid #1A1C24', zIndex: 90
            }}>
                <Button
                    block
                    onClick={handleSave}
                    style={{ backgroundColor: '#6C5CE7', color: '#fff', border: 'none', borderRadius: '12px', height: '48px', fontSize: '16px', fontWeight: 600 }}
                >
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
            <div style={{ fontSize: '14px', color: '#9CA3AF', marginBottom: '8px' }}>{label}</div>
            <div style={{ backgroundColor: '#0B0C11', borderRadius: '12px', border: '1px solid #1A1C24', padding: '8px 16px' }}>
                <Input
                    type="number"
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    style={{ '--color': '#F8F9FA', '--font-size': '16px' }}
                />
            </div>
        </div>
    );
}

// 辅助子组件：计算结果项
function CalcItem({ label, value, color }: { label: string, value: string, color: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#6D6F7E', marginBottom: '4px' }}>{label}</span>
            <span style={{ fontSize: '18px', fontWeight: 700, color }}>{value}</span>
        </div>
    );
}
