import { useState, useEffect } from 'react';
import { Popup, Input, Button, Toast } from 'antd-mobile';
import { X } from 'lucide-react';
import clsx from 'clsx';
import styles from './SellModal.module.less';

const FRACTIONS = [
    { label: '全仓', f: 1 },
    { label: '半仓', f: 0.5 },
    { label: '1/3', f: 0.333 },
    { label: '1/4', f: 0.25 },
];

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

        if (!price || price <= 0) {
            Toast.show('请输入有效的卖出价格');
            return;
        }
        if (!qty || qty <= 0 || qty > holding.remaining_qty) {
            Toast.show(`数量需在 0~${holding.remaining_qty} 之间`);
            return;
        }

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
    const pnlPct = isValidInput && costPrice > 0 ? (pnlPerShare / costPrice) * 100 : 0;

    // 未填全输入时统一置灰，填全后再按涨跌着色
    const pnlTone = (value: number) =>
        !isValidInput ? styles.idle : value >= 0 ? styles.up : styles.down;

    return (
        <Popup visible={visible} onMaskClick={onClose} bodyClassName={styles.popupBody}>
            <div className={styles.body}>
                <div className={styles.header}>
                    <span className={styles.title}>快捷卖出 - {holding.item_name}</span>
                    <span className={styles.closeButton} onClick={onClose}>
                        <X size={24} />
                    </span>
                </div>

                <div className={styles.label}>卖出数量（剩余 {holding.remaining_qty}）</div>

                <div className={styles.fractionRow}>
                    {FRACTIONS.map((btn) => (
                        <div key={btn.label} className={styles.fractionButton} onClick={() => setQtyFraction(btn.f)}>
                            {btn.label}
                        </div>
                    ))}
                </div>

                <div className={styles.inputWrapper}>
                    <Input type="number" value={sellQty} onChange={setSellQty} placeholder="输入数量" />
                </div>

                <div className={styles.label}>实际卖出价格</div>
                <div className={styles.inputWrapper}>
                    <Input type="number" value={sellPrice} onChange={setSellPrice} placeholder="0.00" />
                </div>

                {/* 动态盈亏看板 */}
                <div className={styles.pnlPanel}>
                    <div className={styles.pnlPanelLabel}>预计平仓盈亏 (成本价 {costPrice.toFixed(2)})</div>

                    <div className={styles.pnlPanelBody}>
                        {/* 左侧：总盈亏金额与比例 */}
                        <div className={styles.pnlMain}>
                            <span className={clsx(styles.pnlAmount, pnlTone(totalPnl))}>
                                {isValidInput ? `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}` : '--'}
                            </span>
                            <span className={clsx(styles.pnlPct, pnlTone(pnlPct))}>
                                {isValidInput ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : '--'}
                            </span>
                        </div>

                        {/* 右侧：单仓盈亏明细 */}
                        <div className={styles.pnlSide}>
                            <span className={styles.pnlSideLabel}>单仓盈亏</span>
                            <span className={clsx(styles.pnlSideValue, !isValidInput && styles.idle)}>
                                {isValidInput ? `${pnlPerShare >= 0 ? '+' : ''}${pnlPerShare.toFixed(2)}` : '--'}
                            </span>
                        </div>
                    </div>
                </div>

                <Button block onClick={handleConfirm} className={styles.confirmButton}>
                    确认卖出
                </Button>
            </div>
        </Popup>
    );
}

