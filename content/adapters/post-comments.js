import { createListAdapter } from './base-adapter.js';
import { STANDARD } from '../selectors/standard.js';

// People who commented on a post.
export default createListAdapter({
  id: 'post_comments',
  label: 'Post commenters',
  urlTest: (url) => /(comments|\/detail\/comments|posts\/.*comment)/i.test(url),
  selectors: {
    ...STANDARD,
    resultContainers: [
      'article.comments-comment-entity',
      'div.comments-comment-item',
      '[data-testid="comment-item"]'
    ],
    profileLink: ['a.comments-comment-meta__image-link[href*="/in/"]', 'a[href*="/in/"]'],
    nameText: ['.comments-comment-meta__description-title', 'span[aria-hidden="true"]'],
    headline: ['.comments-comment-meta__description-subtitle', '.entity-result__primary-subtitle'],
    nextPage: ['button.comments-comments-list__load-more-comments-button', 'button[aria-label="Next"]'],
    scrollContainer: ['.comments-comments-list', '.scaffold-finite-scroll']
  }
});
