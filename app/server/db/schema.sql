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
