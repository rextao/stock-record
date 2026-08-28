import type { PointerEvent, ReactNode } from 'react'
import { ChevronDown, ChevronUp, Delete } from 'lucide-react'
import clsx from 'clsx'
import styles from './NumericKeypad.module.less'

/**
 * 页面内自绘的数字键盘。
 *
 * 存在的理由（别改回原生输入框）：iOS 上只要有 input / textarea 拿到焦点，WebKit 就会给软键盘
 * 挂一条表单辅助条（左右箭头 + 完成），它渲染在页面之外，没有任何 CSS / JS / meta 能隐藏，
 * 而 Chrome 桌面端没有软键盘、Android 也不给这条，同一份代码三端观感完全不同。加上软键盘的
 * 弹出与收起会不断改写 visualViewport，聚焦瞬间页面必然抖一下。
 *
 * 所以纯数字字段一律不让原生输入框获得焦点（单元格用 button 承载显示），键盘由这里自己画：
 * 系统键盘全程不出现，视口高度恒定，三端一致。自由文本（备注）仍然走系统键盘，那里的原生
 * 辅助条无法消除，属于已知现状。
 *
 * 按键统一走 onPointerDown + preventDefault：
 * 一是响应比 click 早一帧，连续敲键手感接近真键盘；
 * 二是阻止默认行为可以避免长按选中、以及焦点在按钮之间来回跳动。
 *
 * 定位只写 bottom: 0。body 已被 global.less 钉在 visualViewport 上，不要再叠
 * --app-keyboard-inset —— 这里根本不会有软键盘。
 */

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** 供调用方量取键盘实际高度（px 会被转成 vw，硬编码常量在不同屏宽下都是错的） */
export const NUMERIC_KEYPAD_ID = 'numeric-keypad'

type Props = {
    visible: boolean
    /** 当前字段是否允许小数点（股数这类整数字段要把这个键禁掉） */
    allowDecimal: boolean
    canPrev: boolean
    canNext: boolean
    onInput: (char: string) => void
    onBackspace: () => void
    onPrev: () => void
    onNext: () => void
    onDone: () => void
    /** 顶排信息区，一般放随输入实时变化的关键指标（键盘会盖住页面里的计算面板） */
    children?: ReactNode
}

export default function NumericKeypad({
    visible,
    allowDecimal,
    canPrev,
    canNext,
    onInput,
    onBackspace,
    onPrev,
    onNext,
    onDone,
    children,
}: Props) {
    if (!visible) return null

    const press = (handler: () => void) => (event: PointerEvent<HTMLButtonElement>) => {
        event.preventDefault()
        handler()
    }

    return (
        <div id={NUMERIC_KEYPAD_ID} className={styles.keypad} role="group" aria-label="数字键盘">
            {children ? <div className={styles.info}>{children}</div> : null}

            <div className={styles.nav}>
                <div className={styles.navGroup}>
                    <button
                        type="button"
                        className={styles.navButton}
                        aria-label="上一项"
                        disabled={!canPrev}
                        onPointerDown={press(onPrev)}
                    >
                        <ChevronUp size={20} />
                    </button>
                    <button
                        type="button"
                        className={styles.navButton}
                        aria-label="下一项"
                        disabled={!canNext}
                        onPointerDown={press(onNext)}
                    >
                        <ChevronDown size={20} />
                    </button>
                </div>

                <button type="button" className={styles.done} onPointerDown={press(onDone)}>
                    完成
                </button>
            </div>

            <div className={styles.keys}>
                {DIGITS.map((digit) => (
                    <button
                        key={digit}
                        type="button"
                        className={styles.key}
                        onPointerDown={press(() => onInput(digit))}
                    >
                        {digit}
                    </button>
                ))}

                <button
                    type="button"
                    className={clsx(styles.key, styles.keySecondary)}
                    aria-label="小数点"
                    disabled={!allowDecimal}
                    onPointerDown={press(() => onInput('.'))}
                >
                    .
                </button>
                <button type="button" className={styles.key} onPointerDown={press(() => onInput('0'))}>
                    0
                </button>
                <button
                    type="button"
                    className={clsx(styles.key, styles.keySecondary)}
                    aria-label="删除"
                    onPointerDown={press(onBackspace)}
                >
                    <Delete size={20} />
                </button>
            </div>
        </div>
    )
}
