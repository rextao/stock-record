-- 已有 D1 库执行一次：允许买入记录的预期买入价、止损价为空。
-- SQLite 不支持直接删除 NOT NULL 约束，因此重建 trades 表；旧数据完整复制。
PRAGMA foreign_keys=OFF;

CREATE TABLE trades_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    current_price REAL NOT NULL,
    target_price REAL,
    stop_loss_price REAL,
    actual_price REAL,
    buy_quantity REAL NOT NULL,
    sold_quantity REAL DEFAULT 0,
    notes TEXT,
    buy_time TEXT NOT NULL,
    sell_time TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
);

INSERT INTO trades_new (
    id, item_id, current_price, target_price, stop_loss_price, actual_price,
    buy_quantity, sold_quantity, notes, buy_time, sell_time, created_at
)
SELECT
    id, item_id, current_price, target_price, stop_loss_price, actual_price,
    buy_quantity, sold_quantity, notes, buy_time, sell_time, created_at
FROM trades;

DROP TABLE trades;
ALTER TABLE trades_new RENAME TO trades;

PRAGMA foreign_keys=ON;
