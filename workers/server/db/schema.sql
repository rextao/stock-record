CREATE TABLE IF NOT EXISTS items (
                                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                                     name TEXT NOT NULL,
                                     symbol TEXT,
                                     description TEXT,
                                     exchange TEXT,
                                     created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
                                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                                      item_id INTEGER NOT NULL,
                                      current_price REAL NOT NULL,
                                      target_price REAL NOT NULL,
                                      stop_loss_price REAL NOT NULL,
                                      actual_price REAL,
                                      buy_quantity REAL NOT NULL,
                                      sold_quantity REAL DEFAULT 0,
                                      notes TEXT,
                                      buy_time TEXT NOT NULL,
                                      sell_time TEXT,
                                      created_at TEXT NOT NULL,
                                      FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS sell_records (
                                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                                            trade_id INTEGER NOT NULL,
                                            sell_price REAL NOT NULL,
                                            sell_quantity REAL NOT NULL,
                                            sell_time TEXT NOT NULL,
                                            FOREIGN KEY(trade_id) REFERENCES trades(id) ON DELETE CASCADE
    );

-- 历史行情的本地副本。收盘后的 K 线不再变化，抓到一次就能一直用，
-- 上游（Yahoo）按出口 IP 限流时靠它兜底，曲线不会退化成错误页。
-- 复合主键自带的索引就是查询用的索引：where symbol=? and interval=? and ts>=? 全靠它，
-- 少了它每次看图都会全表扫描 —— D1 的 rows read 计的是扫描行数，那才是烧额度的写法。
CREATE TABLE IF NOT EXISTS price_candles (
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,
    ts INTEGER NOT NULL,        -- 该点的时间戳，epoch ms（与 PriceCandle.t 一致）
    date TEXT NOT NULL,         -- 交易所当地交易日 YYYY-MM-DD
    close REAL NOT NULL,
    open REAL,                  -- 以下三列只给 K 线用，可空：早于本次改动写入的行没有
    high REAL,
    low REAL,
    PRIMARY KEY (symbol, interval, ts)
);

-- 每个 (symbol, interval) 的抓取水位。存在的意义是让「要不要打上游」只查一行，
-- 而不是对 price_candles 做 min/max 聚合（那等于全表扫描）。
CREATE TABLE IF NOT EXISTS price_candle_sync (
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,   -- 最近一次真正打上游的时刻，epoch ms
    utc_offset INTEGER NOT NULL,   -- 交易所时区偏移（秒）
    oldest_ts INTEGER NOT NULL,
    newest_ts INTEGER NOT NULL,
    PRIMARY KEY (symbol, interval)
);
