import { List } from 'antd-mobile'
import { useNavigate } from 'react-router'
// 使用 lucide-react 替代原有的 @taroify/icons
import { ListTree, ChevronRight } from 'lucide-react'

export default function MineRoute() {
    const navigate = useNavigate()

    return (
        <div style={{ padding: '16px 16px 100px', minHeight: '100vh', backgroundColor: '#000000' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 600, color: '#fff', marginBottom: '24px' }}>
                我的
            </h2>

            {/* 分组标题，对应原代码的 section-group-title */}
            <div style={{ fontSize: '14px', color: '#6D6F7E', marginBottom: '8px', marginLeft: '8px', letterSpacing: '1px' }}>
                数据管理
            </div>

            {/* 对应原代码的 section-card */}
            <List
                style={{
                    '--border-top': 'none',
                    '--border-bottom': 'none',
                    '--border-inner': '1px solid #1A1C24',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    backgroundColor: '#0B0C11' // 适配深色卡片背景
                }}
            >
                {/* 条目管理菜单项 */}
                <List.Item
                    prefix={
                        <div style={{
                            backgroundColor: 'rgba(108,92,231,0.15)',
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <ListTree size={18} color="#A855F7" />
                        </div>
                    }
                    extra={<ChevronRight size={20} color="#6D6F7E" />}
                    onClick={() => navigate('/items/manage')}
                    style={{ '--active-background-color': '#1A1C24' }}
                >
                    <span style={{ color: '#F8F9FA', fontSize: '16px' }}>条目管理</span>
                </List.Item>
            </List>
        </div>
    )
}
