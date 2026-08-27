import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { NavBar, Dialog, Toast } from "antd-mobile";
import { ChevronRight, Trash2, ListTree } from "lucide-react";
import { EmptyState } from "../../common/components/EmptyState";
import { FloatingActionButton } from "../../common/components/FloatingActionButton";
import { deleteItem, fetchItems } from "../../api/trading";
import styles from "./manage.module.less";

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
            confirmText: <span className={styles.dangerText}>删除</span>,
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
        <div className={styles.page}>
            <NavBar onBack={() => navigate(-1)} className={styles.navBar}>
                条目管理
            </NavBar>

            <div className={styles.content}>
                {items.length === 0 ? (
                    <EmptyState
                        compact
                        icon={ListTree}
                        title="暂无条目"
                        description="点击右下角「＋」添加投资标的"
                    />
                ) : (
                    <div className={styles.list}>
                        {items.map((item: any) => (
                            <div key={item.id} className={styles.row}>
                                {/* 左侧点击进入编辑 */}
                                <div
                                    className={styles.rowMain}
                                    onClick={() => navigate(`/items/edit/${item.id}`)}
                                >
                                    <span className={styles.rowName}>{item.name}</span>
                                    <span className={styles.rowArrow}>
                                        <ChevronRight size={20} />
                                    </span>
                                </div>

                                {/* 右侧删除按钮 */}
                                <div className={styles.deleteButton} onClick={() => handleDelete(item)}>
                                    <Trash2 size={20} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <FloatingActionButton aria-label="新增条目" onClick={() => navigate('/items/new')} />
        </div>
    )
}

