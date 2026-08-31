import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation, Form, redirect, useActionData } from "react-router";
import { NavBar, Button, Input, TextArea, Toast, DotLoading } from "antd-mobile";
import clsx from "clsx";
import { fetchItems, updateItem } from "~/api/trading";
import type { Item } from "~/features/trade-record/types";
import styles from "./edit.module.less";

// ==========================================
// 1. 客户端数据逻辑（保存走 Form + clientAction）
// ==========================================
export async function clientAction({
    request,
    params,
}: {
    request: Request;
    params: { id?: string };
}) {
    const id = Number(params.id);
    if (!id) return { error: "无效的条目 ID" };

    const formData = await request.formData();
    const name = ((formData.get("name") as string) || "").trim();
    if (!name) return { error: "请填写条目名称" };

    try {
        await updateItem(id, {
            name,
            // 代码留空即清空：后端会存 NULL，此后这个条目不再拉行情
            symbol: ((formData.get("symbol") as string) || "").trim(),
            description: ((formData.get("description") as string) || "").trim(),
        });
        return redirect("/items/manage");
    } catch (error: any) {
        return { error: (error.message as string) || "保存失败，请稍后重试" };
    }
}

// ==========================================
// 2. 客户端 UI 组件
// ==========================================
export default function EditItemRoute() {
    const navigate = useNavigate();
    const params = useParams();
    const location = useLocation();
    const id = Number(params.id);

    // 从条目管理页点进来时列表数据已经在手上，直接用，省一次请求
    const preset = (location.state as { item?: Item } | null)?.item;

    const [item, setItem] = useState<Item | null>(preset ?? null);
    const [loadError, setLoadError] = useState("");
    const [name, setName] = useState(preset?.name ?? "");
    const [symbol, setSymbol] = useState(preset?.symbol ?? "");
    const [description, setDescription] = useState(preset?.description ?? "");

    const actionData = useActionData<typeof clientAction>();

    useEffect(() => {
        if (actionData?.error) {
            Toast.show({ icon: "fail", content: actionData.error });
        }
    }, [actionData]);

    // 深链或刷新进来时没有 location.state，自己补一次查询。
    // 刻意不用 clientLoader：RR7 的 loader 会阻塞导航，点击后要等接口回来才跳页，看着像卡住
    useEffect(() => {
        if (item || !id) return;

        let alive = true;
        const controller = new AbortController();

        fetchItems({ signal: controller.signal })
            .then(({ items }) => {
                if (!alive) return;
                const found = items.find((row) => row.id === id);
                if (!found) {
                    setLoadError("条目不存在或已被删除");
                    return;
                }
                setItem(found);
                setName(found.name);
                setSymbol(found.symbol ?? "");
                setDescription(found.description ?? "");
            })
            .catch((error: any) => {
                if (alive) setLoadError((error.message as string) || "加载失败，请稍后重试");
            });

        return () => {
            alive = false;
            controller.abort();
        };
    }, [id, item]);

    const trimmedName = name.trim();
    const trimmedSymbol = symbol.trim().toUpperCase();
    const canSave = !!item && trimmedName.length > 0;
    // 原来有代码、现在清空了：行情会跟着停掉，得说清楚
    const willDropQuote = !!item?.symbol && trimmedSymbol.length === 0;

    const handleSave = (e: React.MouseEvent) => {
        if (canSave) return;
        e.preventDefault();
        Toast.show({ icon: "fail", content: item ? "请填写条目名称" : "条目还没加载完" });
    };

    return (
        <div className={styles.page}>
            <NavBar onBack={() => navigate("/items/manage", { replace: true })} className={styles.navBar}>
                编辑条目
            </NavBar>

            <div className={styles.content}>
                {loadError ? (
                    <div className={styles.loadError}>{loadError}</div>
                ) : !item ? (
                    <div className={styles.loading}>
                        <DotLoading />
                    </div>
                ) : (
                    <>
                        <div className={styles.fieldLabel}>条目名称</div>
                        <div className={styles.field}>
                            <Input
                                value={name}
                                onChange={setName}
                                placeholder="例如 贵州茅台"
                                className={styles.fieldInput}
                                clearable
                            />
                        </div>

                        <div className={clsx(styles.fieldLabel, styles.fieldLabelGap)}>股票代码（可选）</div>
                        <div className={styles.field}>
                            <Input
                                value={symbol}
                                onChange={setSymbol}
                                placeholder="留空则不拉行情"
                                className={styles.fieldInput}
                                clearable
                            />
                        </div>

                        <div className={clsx(styles.fieldLabel, styles.fieldLabelGap)}>说明（可选）</div>
                        <div className={styles.field}>
                            <TextArea
                                value={description}
                                onChange={setDescription}
                                placeholder="备注信息，只用于展示"
                                rows={2}
                                className={styles.fieldInput}
                            />
                        </div>

                        <div className={styles.tip}>
                            交易记录跟着条目 ID 走，改名和改代码都不会影响已有的买卖记录。
                            {willDropQuote ? "清空代码后，这个条目的现价会显示 --，也不再有走势入口。" : ""}
                        </div>
                    </>
                )}
            </div>

            <Form method="post" className={styles.actionBar}>
                <input type="hidden" name="name" value={trimmedName} />
                <input type="hidden" name="symbol" value={trimmedSymbol} />
                <input type="hidden" name="description" value={description} />

                <Button
                    type="submit"
                    block
                    className={clsx(styles.saveButton, !canSave && styles.saveButtonDisabled)}
                    onClick={handleSave}
                >
                    保存修改
                </Button>
            </Form>
        </div>
    );
}
