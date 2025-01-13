-- Migration number: 0002 	 2025-01-13T06:40:56.529Z
INSERT INTO "Markdown" (subject, content, deleted) VALUES 
('Introduction to SQL', 'SQL is a standard language for accessing databases.', 0),
('Markdown Basics', 'Markdown is a lightweight markup language.', 0),
('Advanced Markdown', 'Advanced features of Markdown include tables and lists.', 0);

INSERT INTO "Tag" (name) VALUES 
('SQL'),
('Markdown'),
('Database'),
('Tutorial');

INSERT INTO "_MarkdownToTag" (A, B) VALUES 
(1, 1),  -- 将 "Introduction to SQL" 与 "SQL" 标签关联
(1, 3),  -- 将 "Introduction to SQL" 与 "Database" 标签关联
(2, 2),  -- 将 "Markdown Basics" 与 "Markdown" 标签关联
(3, 2),  -- 将 "Advanced Markdown" 与 "Markdown" 标签关联
(3, 4);  -- 将 "Advanced Markdown" 与 "Tutorial" 标签关联
