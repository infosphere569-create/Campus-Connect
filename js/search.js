import { SEARCH_INDEX, getSearchIndex, searchContent } from '../search.js';

export { SEARCH_INDEX, getSearchIndex, searchContent };

export async function globalSearch(text) {
  const results = await searchContent(text);
  return results.map(r => ({
    id: r.url.split('=').pop() || '',
    type: r.category.toLowerCase(),
    category: r.category,
    title: r.title,
    url: r.url,
    desc: r.desc
  }));
}
