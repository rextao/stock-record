import { useState, useEffect } from 'react';
import { Popup, Button, Toast } from 'antd-mobile';
import { X } from 'lucide-react';
import clsx from 'clsx';
import NumericKeypad from '../../../common/components/NumericKeypad';
import { sanitizeDecimalInput, sanitizeIntegerInput } from '../../../utils/numberInput';
import { readQuoteCache } from '../sessionCache';
import styles from './SellModal.module.less';

const FRACTIONS = [
    { label: '全仓', f: 1 },
    { label: '半仓', f: 0.5 },
    { label: '1/3', f: 1 / 3 },
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
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    useEffect(() => {
        if (visible) {
            setSellPrice('');
            setSellQty('');
            setActiveIndex(0);
        }
    }, [visible, holding]);

    const setQtyFraction = (fraction: number) => {
        if (!holding) return;
        const total = holding.remaining_qty;
        const val = Math.max(1, Math.min(Math.floor(total * fraction), total));
        setSellQty(String(val));
        setActiveIndex(1);
    };

    const fields = [
        { value: sellQty, setValue: setSellQty, kind: 'integer' as const, maxLength: 8 },
        { value: sellPrice, setValue: setSellPrice, kind: 'decimal' as const, maxLength: 7 },
    ];
    const activeField = activeIndex === null ? null : fields[activeIndex];

    const handleKeyInput = (char: string) => {
        if (!activeField) return;
        const raw = char === '.' && activeField.value === '' ? '0.' : activeField.value + char;
        const next = activeField.kind === 'integer'
            ? sanitizeIntegerInput(raw)
            : sanitizeDecimalInput(raw);
        if (next === activeField.value || next.length > activeField.maxLength) return;
        activeField.setValue(next);
    };

    const handleConfirm = () => {
        const price = parseFloat(sellPrice);
        const qty = parseInt(sellQty, 10);

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
    const inputQty = parseInt(sellQty, 10) || 0;
    // 现价快填：/api/holdings 不再带 live_price，回退到首页卡片写进 sessionCache 的报价缓存；
    // 都没有（如详情页打开、或还没补到价）就不显示按钮。
    const livePrice =
        typeof holding.live_price === 'number'
            ? holding.live_price
            : readQuoteCache(holding.item_symbol)?.price ?? null;

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
            <div className={clsx(styles.body, activeIndex !== null && styles.bodyKeypadOpen)}>
                <div className={styles.header}>
                    <span className={styles.title}>快捷卖出 - {holding.item_name}</span>
                    <button type="button" className={styles.closeButton} onClick={onClose} aria-label="关闭">
                        <X size={24} />
                    </button>
                </div>

                <div className={styles.label}>卖出数量（剩余 {holding.remaining_qty}）</div>

                <div className={styles.fractionRow}>
                    {FRACTIONS.map((btn) => (
                        <button type="button" key={btn.label} className={styles.fractionButton} onClick={() => setQtyFraction(btn.f)}>
                            {btn.label}
                        </button>
                    ))}
                </div>

                <button
                    type="button"
                    className={clsx(styles.inputCell, activeIndex === 0 && styles.inputCellActive)}
                    onPointerDown={(event) => { event.preventDefault(); setActiveIndex(0); }}
                    aria-label={`卖出数量 ${sellQty || '未填写'}`}
                >
                    <span className={sellQty ? styles.inputValue : styles.placeholder}>{sellQty || '输入数量'}</span>
                    {activeIndex === 0 && <span className={styles.caret} aria-hidden="true" />}
                </button>

                <div className={styles.priceLabelRow}>
                    <span className={styles.label}>实际卖出价格</span>
                    {livePrice != null && (
                        <button
                            type="button"
                            className={styles.fillPriceButton}
                            onClick={() => setSellPrice(livePrice.toFixed(2))}
                        >
                            现价 {livePrice.toFixed(2)}
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    className={clsx(styles.inputCell, activeIndex === 1 && styles.inputCellActive)}
                    onPointerDown={(event) => { event.preventDefault(); setActiveIndex(1); }}
                    aria-label={`实际卖出价格 ${sellPrice || '未填写'}`}
                >
                    <span className={sellPrice ? styles.inputValue : styles.placeholder}>{sellPrice || '0.00'}</span>
                    {activeIndex === 1 && <span className={styles.caret} aria-hidden="true" />}
                </button>

                {/* 动态盈亏看板 */}
                {activeIndex === null && <div className={styles.pnlPanel}>
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
                </div>}

                {activeIndex === null && <Button block onClick={handleConfirm} className={styles.confirmButton}>
                    确认卖出
                </Button>}
            </div>

            <NumericKeypad
                embedded
                visible={activeIndex !== null}
                allowDecimal={activeField?.kind === 'decimal'}
                canPrev={activeIndex !== null && activeIndex > 0}
                canNext={activeIndex !== null && activeIndex < fields.length - 1}
                onInput={handleKeyInput}
                onBackspace={() => activeField?.setValue(activeField.value.slice(0, -1))}
                onPrev={() => activeIndex !== null && setActiveIndex(activeIndex - 1)}
                onNext={() => activeIndex !== null && setActiveIndex(activeIndex + 1)}
                onDone={() => setActiveIndex(null)}
            >
                <span className={styles.keypadMetric}>
                    预计盈亏
                    <b className={pnlTone(totalPnl)}>
                        {isValidInput ? `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}` : '--'}
                    </b>
                </span>
                <span className={styles.keypadMetric}>
                    盈亏比例
                    <b className={pnlTone(pnlPct)}>
                        {isValidInput ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : '--'}
                    </b>
                </span>
            </NumericKeypad>
        </Popup>
    );
}
