import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { NavBar, Dialog, Toast } from "antd-mobile";
import { ChevronRight, Trash2, ListTree, Plus } from "lucide-react";
import { deleteItem, fetchItems } from "../../api/trading";

// ==========================================
// 1. 客户端数据逻辑（请求 Worker 上的 /api）
// ==========================================

export async function clientLoader({ request }: { request: Request }) {
    return fetchItems({ signal: request.signal });
}

export async function clientAction({ request }: { request: Request }) {
    const formData = await request.formData();
    const intent = formData.get("intent");
    const id = Number(formData.get("id"));

    if (intent === "delete" && id) {
        try {
            return await deleteItem(id);
        } catch (error: any) {
            return { error: error.message as string };
        }
    }

    return { error: "未知操作" };
}

// ==========================================
// 2. 客户端 UI 组件
// ==========================================

export default function ItemsManageRoute() {
    const navigate = useNavigate();
    // 拿到 loader 返回的数据
    const { items } = useLoaderData<typeof clientLoader>();
    // fetcher 用于在不引起页面完整刷新的情况下提交 action (比如删除)
    const fetcher = useFetcher();

    // 执行删除逻辑
    const handleDelete = (item: any) => {
        Dialog.confirm({
            title: '删除条目',
            content: `确定删除"${item.name}"吗？该条目下的所有交易记录也会被一并删除。`,
            confirmText: <span style={{ color: '#FF5252' }}>删除</span>,
            onConfirm: async () => {
                fetcher.submit(
                    { intent: "delete", id: item.id.toString() },
                    { method: "post" }
                );
                Toast.show({ icon: 'success', content: '删除成功' });
            },
        });
    };

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#fff', display: 'flex', flexDirection: 'column' }}>
            <NavBar
                onBack={() => navigate(-1)}
                style={{ '--border-bottom': '1px solid #1A1C24', backgroundColor: '#000000' }}
            >
                条目管理
            </NavBar>

            <div style={{ padding: '16px', flex: 1, paddingBottom: '120px' }}>
                {items.length === 0 ? (
                    // 空状态展示
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '80px' }}>
                        <ListTree size={56} color="#A855F7" style={{ marginBottom: '20px' }} />
                        <div style={{ fontSize: '20px', fontWeight: 600, color: '#F8F9FA' }}>暂无条目</div>
                        <div style={{ fontSize: '14px', color: '#6D6F7E', marginTop: '8px' }}>点击右下角「＋」添加投资标的</div>
                    </div>
                ) : (
                    // 数据列表
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {items.map((item: any) => (
                            <div
                                key={item.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    backgroundColor: '#0B0C11',
                                    border: '1px solid #1A1C24',
                                    borderRadius: '12px',
                                    overflow: 'hidden'
                                }}
                            >
                                {/* 左侧点击进入编辑 */}
                                <div
                                    style={{ flex: 1, padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    onClick={() => navigate(`/items/edit/${item.id}`)}
                                >
                                    <span style={{ fontSize: '16px', color: '#F8F9FA' }}>{item.name}</span>
                                    <ChevronRight size={20} color="#6D6F7E" />
                                </div>

                                {/* 右侧删除按钮 */}
                                <div
                                    style={{
                                        padding: '16px 20px',
                                        borderLeft: '1px solid rgba(128, 128, 128, 0.15)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    onClick={() => handleDelete(item)}
                                >
                                    <Trash2 size={20} color="#FF5252" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 悬浮新增按钮 (对应原逻辑的 FloatingActionButton) */}
            <div
                style={{
                    position: 'fixed',
                    right: '24px',
                    bottom: 'calc(32px + env(safe-area-inset-bottom))',
                    width: '48px',
                    height: '48px',
                    backgroundColor: '#6C5CE7',
                    borderRadius: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 20px rgba(91, 65, 196, 0.38)',
                    zIndex: 90
                }}
                onClick={() => navigate('/items/new')}
            >
                <Plus size={28} color="#FFFFFF" />
            </div>
        </div>
    )
}
