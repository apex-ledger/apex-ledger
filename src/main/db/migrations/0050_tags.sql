-- Tags: a second way to slice the books, cutting across the chart of accounts.
--
-- Accounts answer "what kind of cost is this". Tags answer everything else a business wants to know:
-- which location, which job, which vehicle, which partner. Those questions cannot be answered by
-- adding more accounts — a five-store grocery would need five copies of every expense account, and
-- the chart becomes unreadable long before it becomes useful.
--
-- Tags belong to GROUPS, and that is the whole point. "Store" is a group; Dundas, Kipling and
-- Malton are tags within it. A transaction carries at most one tag from each group, so a report can
-- put the groups' tags along the top as columns and have them add up to the total. Without groups,
-- tags are a pile of labels that overlap and double-count.

CREATE TABLE tag_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag_group_id INTEGER NOT NULL REFERENCES tag_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Unique within a group, not globally: two groups can each have a "Head Office" and mean different
-- things, and forcing global uniqueness would make people invent prefixes.
CREATE UNIQUE INDEX idx_tags_group_name ON tags(tag_group_id, name);
CREATE INDEX idx_tags_group ON tags(tag_group_id);

-- Tags attach to LINES rather than to whole entries. One entry often spreads across places: a
-- single supplier invoice covering three stores has to split three ways, and tagging the entry
-- could only ever attribute it to one.
CREATE TABLE journal_entry_line_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_entry_line_id INTEGER NOT NULL REFERENCES journal_entry_lines(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE
);

-- One tag per line, and never the same tag twice.
CREATE UNIQUE INDEX idx_line_tags_unique ON journal_entry_line_tags(journal_entry_line_id, tag_id);
CREATE INDEX idx_line_tags_line ON journal_entry_line_tags(journal_entry_line_id);
CREATE INDEX idx_line_tags_tag ON journal_entry_line_tags(tag_id);
