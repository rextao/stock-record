import { useLayoutEffect, useRef } from 'react'
import type { ClipboardEvent, FocusEvent } from 'react'
import clsx from 'clsx'
import styles from './PlainTextArea.module.less'

/**
 * 多行自由文本输入框，用 contenteditable 而不是 <textarea>。
 *
 * 存在的理由（别改回 textarea / antd-mobile TextArea）：浏览器的自动填充只认表单控件，
 * 只要焦点落在 input / textarea 上，Chrome 就会在软键盘上方挂一条「填支付卡等信息 / 填地址」
 * 的建议条，iOS Safari 则挂一条「上一项 / 下一项 / 完成」的表单辅助条。两者都渲染在页面之外，
 * CSS 碰不到，autocomplete="off" 也管不住（Chrome 只把它当「别记住这个值」的弱提示）。
 * contenteditable 区域不是表单控件，聚焦时只会弹出纯软键盘，没有那条工具条。
 *
 * 这跟 NumericKeypad 是同一个思路：数字字段干脆不弹系统键盘，自由文本没法不弹，
 * 那就至少不让浏览器把它当成表单字段。
 *
 * 代价是 textarea 免费给的几件事要自己管，都在下面处理了：受控写回的光标位置、纯文本粘贴、
 * 空值时的 placeholder、以及行数上下限（改成 Less 里的 min/max-height）。
 */

/**
 * contenteditable="plaintext-only" 能让浏览器原生拒收富文本（粘贴、拖拽、Cmd+B 都只留纯文本）。
 * Chrome 和 Safari 17+ 支持，Firefox 不支持且会把这个值当无效处理 —— 直接写死属性会让元素
 * 在 Firefox 上根本不可编辑，所以探测一次再决定，探测失败退回 true 并靠 onPaste 兜住纯文本。
 */
const plaintextOnlySupported = (() => {
    if (typeof document === 'undefined') return false
    const probe = document.createElement('div')
    probe.setAttribute('contenteditable', 'plaintext-only')
    return probe.contentEditable === 'plaintext-only'
})()

type Props = {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    /** 无可见 label 时必须给，否则读屏软件只能读到一团空白 */
    ariaLabel?: string
    className?: string
    onFocus?: (event: FocusEvent<HTMLDivElement>) => void
    onBlur?: (event: FocusEvent<HTMLDivElement>) => void
}

/** 读回当前文本：换行在 contenteditable 里可能是 <br> 也可能是 <div>，只有 innerText 两种都认 */
const readText = (el: HTMLDivElement) => el.innerText

export default function PlainTextArea({
    value,
    onChange,
    placeholder,
    ariaLabel,
    className,
    onFocus,
    onBlur,
}: Props) {
    const ref = useRef<HTMLDivElement | null>(null)
    /*
     * 上一次同步给 DOM 的文本。受控组件每次 render 都想把 value 写回 DOM，而写 DOM 会把光标
     * 顶到开头 —— 中文输入法下表现为输一个字就跳一次。所以只在 value 不是自己刚上报的那个值时
     * 才写（外部重置、回显草稿等），用户自己敲出来的变化一律不动 DOM。
     * 初始为 null 以便首次挂载时把初值写进去。
     */
    const syncedRef = useRef<string | null>(null)

    useLayoutEffect(() => {
        const el = ref.current
        if (!el || syncedRef.current === value) return
        el.textContent = value
        syncedRef.current = value
    }, [value])

    const handleInput = () => {
        const el = ref.current
        if (!el) return
        const next = readText(el)
        syncedRef.current = next
        onChange(next)
    }

    const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
        if (plaintextOnlySupported) return
        // 退化路径：自己把剪贴板降级成纯文本。execCommand 虽已废弃，但它是唯一能保留光标位置
        // 和撤销栈的插入方式，手写 Range 会丢掉 Cmd+Z。
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, text)
    }

    return (
        <div
            ref={ref}
            className={clsx(styles.area, className)}
            contentEditable={plaintextOnlySupported ? 'plaintext-only' : true}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={ariaLabel ?? placeholder}
            /* placeholder 不能只靠 :empty：删空之后浏览器常留一个占位 <br>，:empty 就不成立了 */
            data-empty={value.length === 0}
            data-placeholder={placeholder}
            spellCheck={false}
            autoCorrect="off"
            onInput={handleInput}
            onPaste={handlePaste}
            onFocus={onFocus}
            onBlur={onBlur}
        />
    )
}
