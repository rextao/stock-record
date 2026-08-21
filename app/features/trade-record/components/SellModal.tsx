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
            setSellPrice('');
            setSellQty('');
        }
    }, [visible]);

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

        // 👈 核心修改：只调用方法，不在这里展示 Toast，也不直接 Close，交由父组件根据真实请求结果来控制
        onConfirm(price, qty);
    };

    if (!holding) return null;

    return (
        <Popup visible={visible} onMaskClick={onClose} bodyStyle={{ borderTopLeftRadius: '16px', borderTopRightRadius: '16px', backgroundColor: '#12121A' }}>
            {/* UI 代码保持不变 */}
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
                <div style={{ backgroundColor: '#0B0C11', borderRadius: '8px', padding: '8px 12px', border: '1px solid #1A1C24', marginBottom: '24px' }}>
                    <Input type="number" value={sellPrice} onChange={setSellPrice} placeholder="0.00" style={{ '--color': '#fff' }} />
                </div>

                <Button block onClick={handleConfirm} style={{ backgroundColor: '#00E676', color: '#000', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600, height: '48px' }}>
                    确认卖出
                </Button>
            </div>
        </Popup>
    );
}
