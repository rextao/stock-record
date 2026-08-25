import { useState, useEffect } from 'react';
import { Popup, Input, Button, Toast } from 'antd-mobile';
import { X } from 'lucide-react';

export function SellModal({
                              visible,
                              holding,
                              onClose,
                              onConfirm
                          }: {
    visible: boolean,
    holding: any,
    onClose: () => void,
    onConfirm: (price: number, qty: number) => void
}) {
    const [sellPrice, setSellPrice] = useState('');
    const [sellQty, setSellQty] = useState('');

    useEffect(() => {
        if (visible) {
            // 如果想体验更好，你可以把下一行改成 setSellPrice(holding?.live_price ? String(holding.live_price) : '');
            setSellPrice('');
            setSellQty('');
        }
    }, [visible, holding]);

    const setQtyFraction = (fraction: number) => {
        if (!holding) return;
        const total = holding.remaining_qty;
        const val = Math.max(1, Math.min(Math.floor(total * fraction), total));
        setSellQty(String(val));
    };

    const handleConfirm = () => {
        const price = parseFloat(sellPrice);
        const qty = parseFloat(sellQty);

        if (!price || price <= 0) return Toast.show('请输入有效的卖出价格');
        if (!qty || qty <= 0 || qty > holding.remaining_qty) return Toast.show(`数量需在 0~${holding.remaining_qty} 之间`);

        onConfirm(price, qty);
    };

    if (!holding) return null;

    // ==========================================
    // 动态预计盈亏计算
    // ==========================================
    const costPrice = holding.weighted_avg_price || 0;
    const inputPrice = parseFloat(sellPrice) || 0;
    const inputQty = parseFloat(sellQty) || 0;

    const isValidInput = inputPrice > 0 && inputQty > 0;

    // 单仓盈亏 = 卖出价 - 加权均价
    const pnlPerShare = isValidInput ? inputPrice - costPrice : 0;
    // 总盈亏 = 单仓盈亏 * 卖出数量
    const totalPnl = pnlPerShare * inputQty;
    // 盈亏比例
    const pnlPct = (isValidInput && costPrice > 0) ? (pnlPerShare / costPrice) * 100 : 0;

    return (
        <Popup visible={visible} onMaskClick={onClose} bodyStyle={{ borderTopLeftRadius: '16px', borderTopRightRadius: '16px', backgroundColor: '#12121A' }}>
            <div style={{ padding: '24px', color: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 600 }}>快捷卖出 - {holding.item_name}</span>
                    <X size={24} color="#6D6F7E" onClick={onClose} />
                </div>

                <div style={{ fontSize: '14px', color: '#6D6F7E', marginBottom: '12px' }}>卖出数量（剩余 {holding.remaining_qty}）</div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    {[ {label: '全仓', f: 1}, {label: '半仓', f: 0.5}, {label: '1/3', f: 0.333}, {label: '1/4', f: 0.25} ].map(btn => (
                        <div key={btn.label} onClick={() => setQtyFraction(btn.f)}
                             style={{ flex: 1, textAlign: 'center', padding: '8px 0', backgroundColor: '#0B0C11', border: '1px solid #1A1C24', borderRadius: '8px', fontSize: '14px' }}>
                            {btn.label}
                        </div>
                    ))}
                </div>

                <div style={{ backgroundColor: '#0B0C11', borderRadius: '8px', padding: '8px 12px', border: '1px solid #1A1C24', marginBottom: '16px' }}>
                    <Input type="number" value={sellQty} onChange={setSellQty} placeholder="输入数量" style={{ '--color': '#fff' }} />
                </div>

                <div style={{ fontSize: '14px', color: '#6D6F7E', marginBottom: '12px' }}>实际卖出价格</div>
                <div style={{ backgroundColor: '#0B0C11', borderRadius: '8px', padding: '8px 12px', border: '1px solid #1A1C24', marginBottom: '16px' }}>
                    <Input type="number" value={sellPrice} onChange={setSellPrice} placeholder="0.00" style={{ '--color': '#fff' }} />
                </div>

                {/* ==========================================
                    新增：动态盈亏看板
                ========================================== */}
                <div style={{
                    backgroundColor: '#0B0C11',
                    border: '1px dashed #1A1C24',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    marginBottom: '24px'
                }}>
                    <div style={{ fontSize: '12px', color: '#6D6F7E', marginBottom: '8px' }}>
                        预计平仓盈亏 (成本价 {costPrice.toFixed(2)})
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        {/* 左侧：总盈亏金额与比例 */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{
                                fontSize: '20px',
                                fontWeight: 600,
                                color: !isValidInput ? '#6D6F7E' : (totalPnl >= 0 ? '#FF5252' : '#00E676')
                            }}>
                                {isValidInput ? `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}` : '--'}
                            </span>
                            <span style={{
                                fontSize: '12px',
                                color: !isValidInput ? '#6D6F7E' : (pnlPct >= 0 ? '#FF5252' : '#00E676'),
                                marginTop: '2px'
                            }}>
                                {isValidInput ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : '--'}
                            </span>
                        </div>

                        {/* 右侧：单仓盈亏明细 */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: '11px', color: '#6D6F7E' }}>单仓盈亏</span>
                            <span style={{
                                fontSize: '13px',
                                color: !isValidInput ? '#6D6F7E' : '#fff',
                                marginTop: '2px'
                            }}>
                                {isValidInput ? `${pnlPerShare >= 0 ? '+' : ''}${pnlPerShare.toFixed(2)}` : '--'}
                            </span>
                        </div>
                    </div>
                </div>

                <Button block onClick={handleConfirm} style={{ backgroundColor: '#00E676', color: '#000', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600, height: '48px' }}>
                    确认卖出
                </Button>
            </div>
        </Popup>
    );
}
