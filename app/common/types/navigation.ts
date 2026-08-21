import type { LucideIcon } from 'lucide-react'

export interface TabBarItemConfig {
    key: string
    title: string
    icon: LucideIcon
    badge?: string | number
}
