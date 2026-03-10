import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeShiki from '@shikijs/rehype';
import { createHighlighter } from 'shiki';

async function testSync() {
  console.log('Creating highlighter...');
  const highlighter = await createHighlighter({
    themes: ['catppuccin-latte'],
    langs: ['js']
  });

  console.log('Creating processor...');
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeShiki, {
      highlighter,
      theme: 'catppuccin-latte'
    })
    .use(rehypeStringify);

  console.log('Processing sync...');
  try {
    const result = processor.processSync('```js\nconst a = 1;\n```');
    console.log('Success:', String(result));
  } catch (e) {
    console.error('Failed:', e);
  }
}

testSync();
