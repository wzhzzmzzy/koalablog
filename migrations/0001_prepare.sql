-- Initial data for Home and Nav
INSERT INTO markdown (source, link, subject, content, createdAt, updatedAt, deleted) VALUES
  (1, '/', 'Home', 'Welcome to koala', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0),
  (2, '/nav', 'Nav', '[Home](/) [Posts](/posts)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0);
