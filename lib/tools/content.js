/**
 * Content tools: blogs, blog articles, comments, and pages.
 * @module @shopify/dsh-shopify/tools/content
 */

import { ShopifyError, asObject, defined } from '../util.js';

/** Throw SHOPIFY_INVALID_ARGS when any of `keys` is missing/blank in `args`. */
function required(args, keys) {
  for (const key of keys) {
    if (args[key] === undefined || args[key] === null || args[key] === '') {
      throw new ShopifyError(`${key} is required`, 'SHOPIFY_INVALID_ARGS');
    }
  }
}

export function tools(ctx, deps) {
  const { client } = deps;
  return [
    // ------------------------------------------------------------------
    // Blogs
    // ------------------------------------------------------------------
    {
      name: 'shopify_list_blogs',
      title: 'List blogs',
      kind: 'read',
      description:
        "Lists the store's blogs (newest first by default). Use the returned blog_id values with shopify_get_blog and shopify_list_blog_articles. Blog ids are long numeric REST ids that arrive as strings. When page_info is supplied, only limit and fields may accompany it.",
      parameters: {
        limit: { type: 'integer', description: 'Maximum blogs per page (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only blogs with id greater than this numeric REST id (offset pagination).' },
        fields: { type: 'string', description: 'Comma-separated subset of blog fields to return, e.g. "id,title,handle,commentable".' },
        handle: { type: 'string', description: 'Filter by the blog handle (URL slug), e.g. "news".' },
        page_info: { type: 'string', description: "Cursor from a previous response's next_page_info; loop with page_info until it is null. When present, only limit/fields may accompany it." },
      },
      async execute(args, exec) {
        const query = args.page_info
          ? defined({ page_info: args.page_info, limit: args.limit, fields: args.fields })
          : defined({ limit: args.limit, since_id: args.since_id, fields: args.fields, handle: args.handle });
        const { items, next_page_info } = await client.list('/blogs', query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_blog',
      title: 'Get blog',
      kind: 'read',
      description:
        "Gets a single blog by its numeric REST id (blog_id, string or integer). Use shopify_list_blogs to find ids. Pass fields to trim the response, e.g. fields=id,title,handle,commentable.",
      parameters: {
        blog_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the blog (string or integer).' },
        fields: { type: 'string', description: 'Comma-separated subset of blog fields to return.' },
      },
      async execute(args, exec) {
        required(args, ['blog_id']);
        const body = await client.rest('GET', `/blogs/${args.blog_id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { blog: body.blog };
      },
    },
    {
      name: 'shopify_create_blog',
      title: 'Create blog',
      kind: 'write',
      description:
        'Creates a blog. title is required (max 255 chars); handle defaults from the title if omitted and becomes the URL slug — changing it later breaks existing links. commentable: no (disabled), moderate (require approval), yes (auto-publish); default no. template_suffix must not include "blog" (reserved for the default template).',
      parameters: {
        title: { type: 'string', required: true, description: 'REQUIRED. Blog title, max 255 characters.' },
        handle: { type: 'string', description: 'URL slug (e.g. "news"); defaults from the title if omitted. Changing it later breaks links.' },
        commentable: { type: 'string', enum: ['no', 'moderate', 'yes'], description: 'Comment policy: no (disabled), moderate (approval required), yes (auto-publish). Default no.' },
        template_suffix: { type: 'string', description: 'Suffix of the Liquid template used for this blog (e.g. "custom"); must not be "blog".' },
        metafields: { type: 'array', items: { type: 'json' }, description: 'Optional metafields to create with the blog, each { namespace, key, value, type }.' },
      },
      async execute(args, exec) {
        required(args, ['title']);
        const body = await client.rest('POST', '/blogs', {
          body: {
            blog: defined({
              title: args.title,
              handle: args.handle,
              commentable: args.commentable,
              template_suffix: args.template_suffix,
              metafields: args.metafields,
            }),
          },
          signal: exec.signal,
        });
        return { blog: body.blog };
      },
    },
    {
      name: 'shopify_update_blog',
      title: 'Update blog',
      kind: 'write',
      description:
        "Updates an existing blog. WARNING: changing the blog's handle changes its URL and can break existing links and hurt SEO — confirm the new handle with the user first. feedburner redirects the blog RSS feed; feedburner_location is header or footer.",
      parameters: {
        blog_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the blog to update.' },
        title: { type: 'string', description: 'New blog title, max 255 characters.' },
        handle: { type: 'string', description: 'WARNING: changing the handle changes the blog URL and breaks existing links/SEO.' },
        commentable: { type: 'string', enum: ['no', 'moderate', 'yes'], description: 'Comment policy: no, moderate, or yes.' },
        template_suffix: { type: 'string', description: 'Suffix of the Liquid template used for this blog.' },
        feedburner: { type: 'string', description: 'FeedBurner URL to redirect the blog RSS feed to.' },
        feedburner_location: { type: 'string', enum: ['header', 'footer'], description: 'Where to place the FeedBurner RSS redirect: header or footer.' },
        metafields: { type: 'array', items: { type: 'json' }, description: 'Metafields to update on the blog.' },
      },
      async execute(args, exec) {
        required(args, ['blog_id']);
        const body = await client.rest('PUT', `/blogs/${args.blog_id}`, {
          body: {
            blog: defined({
              title: args.title,
              handle: args.handle,
              commentable: args.commentable,
              template_suffix: args.template_suffix,
              feedburner: args.feedburner,
              feedburner_location: args.feedburner_location,
              metafields: args.metafields,
            }),
          },
          signal: exec.signal,
        });
        return { blog: body.blog };
      },
    },
    {
      name: 'shopify_delete_blog',
      title: 'Delete blog',
      kind: 'write',
      description:
        'Deletes a blog AND all of its articles — this is irreversible. Confirm with the user before executing. Requires write_content scope.',
      parameters: {
        blog_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the blog to delete.' },
      },
      async execute(args, exec) {
        required(args, ['blog_id']);
        await client.rest('DELETE', `/blogs/${args.blog_id}`, { signal: exec.signal });
        return { deleted: true, blog_id: args.blog_id };
      },
    },
    {
      name: 'shopify_count_blogs',
      title: 'Count blogs',
      kind: 'read',
      description: 'Counts the number of blogs in the store. Returns { count } — a quick sanity check before listing or paginating.',
      parameters: {},
      async execute(args, exec) {
        const body = await client.rest('GET', '/blogs/count', { signal: exec.signal });
        return { count: body.count };
      },
    },
    // ------------------------------------------------------------------
    // Blog articles
    // ------------------------------------------------------------------
    {
      name: 'shopify_list_blog_articles',
      title: 'List blog articles',
      kind: 'read',
      description:
        "Lists the articles of one blog (blog_id required, numeric REST id). Filters: author, handle, created/updated/published_at min/max (ISO 8601, evaluated in the shop's timezone — use shopify_get_shop_details for iana_timezone), published_status (published|unpublished|any). Loop with page_info until next_page_info is null.",
      parameters: {
        blog_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the blog.' },
        limit: { type: 'integer', description: 'Maximum articles per page (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only articles with id greater than this numeric REST id.' },
        fields: { type: 'string', description: 'Comma-separated subset of article fields, e.g. "id,title,author,tags".' },
        author: { type: 'string', description: 'Filter by author name.' },
        handle: { type: 'string', description: 'Filter by article handle.' },
        created_at_min: { type: 'string', description: 'ISO 8601 — only articles created at or after this time.' },
        created_at_max: { type: 'string', description: 'ISO 8601 — only articles created at or before this time.' },
        updated_at_min: { type: 'string', description: 'ISO 8601 — only articles updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 — only articles updated at or before this time.' },
        published_at_min: { type: 'string', description: 'ISO 8601 — only articles published at or after this time.' },
        published_at_max: { type: 'string', description: 'ISO 8601 — only articles published at or before this time.' },
        published_status: { type: 'string', enum: ['published', 'unpublished', 'any'], description: 'Filter by published state. Default any.' },
        page_info: { type: 'string', description: "Cursor from a previous response's next_page_info; when present, only limit/fields may accompany it." },
      },
      async execute(args, exec) {
        required(args, ['blog_id']);
        const query = args.page_info
          ? defined({ page_info: args.page_info, limit: args.limit, fields: args.fields })
          : defined({
              limit: args.limit,
              since_id: args.since_id,
              fields: args.fields,
              author: args.author,
              handle: args.handle,
              created_at_min: args.created_at_min,
              created_at_max: args.created_at_max,
              updated_at_min: args.updated_at_min,
              updated_at_max: args.updated_at_max,
              published_at_min: args.published_at_min,
              published_at_max: args.published_at_max,
              published_status: args.published_status,
            });
        const { items, next_page_info } = await client.list(`/blogs/${args.blog_id}/articles`, query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_article',
      title: 'Get blog article',
      kind: 'read',
      description:
        'Gets a single article of a blog. Both blog_id and article_id are numeric REST ids (string or integer). Pass fields to trim the response, e.g. fields=id,title,body_html,author.',
      parameters: {
        blog_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the blog containing the article.' },
        article_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the article.' },
        fields: { type: 'string', description: 'Comma-separated subset of article fields to return.' },
      },
      async execute(args, exec) {
        required(args, ['blog_id', 'article_id']);
        const body = await client.rest('GET', `/blogs/${args.blog_id}/articles/${args.article_id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { article: body.article };
      },
    },
    {
      name: 'shopify_create_article',
      title: 'Create blog article',
      kind: 'write',
      description:
        'Creates an article in a blog. title is required; body_html carries the article content (HTML allowed); tags is a comma-separated string; image.src must be a public HTTPS URL. New articles are created as drafts (published=false) unless published is true / published_at is set.',
      parameters: {
        blog_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the blog to create the article in.' },
        title: { type: 'string', required: true, description: 'REQUIRED. Article title.' },
        body_html: { type: 'string', description: 'Article body in HTML.' },
        summary_html: { type: 'string', description: 'Article summary in HTML (used for excerpts).' },
        author: { type: 'string', description: 'Author name (falls back to the app/account name if omitted).' },
        tags: { type: 'string', description: 'Comma-separated tags, e.g. "news,launch,2024".' },
        image: { type: 'json', description: 'Image object: { "src": "https://..." } — src must be a public HTTPS URL.' },
        published: { type: 'boolean', description: 'Whether the article is published. Default false.' },
        published_at: { type: 'string', description: 'ISO 8601 publish timestamp; implies published=true.' },
        metafields: { type: 'array', items: { type: 'json' }, description: 'Optional metafields to create with the article.' },
      },
      async execute(args, exec) {
        required(args, ['blog_id', 'title']);
        const body = await client.rest('POST', `/blogs/${args.blog_id}/articles`, {
          body: {
            article: defined({
              title: args.title,
              body_html: args.body_html,
              summary_html: args.summary_html,
              author: args.author,
              tags: args.tags,
              image: asObject(args.image),
              published: args.published,
              published_at: args.published_at,
              metafields: args.metafields,
            }),
          },
          signal: exec.signal,
        });
        return { article: body.article };
      },
    },
    {
      name: 'shopify_update_article',
      title: 'Update blog article',
      kind: 'write',
      description:
        'Updates an existing article (title, body_html, summary_html, author, tags, image, published, published_at, metafields). blog_id and article_id are numeric REST ids. To republish a draft, set published=true.',
      parameters: {
        blog_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the blog containing the article.' },
        article_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the article.' },
        title: { type: 'string', description: 'New article title.' },
        body_html: { type: 'string', description: 'Article body in HTML.' },
        summary_html: { type: 'string', description: 'Article summary in HTML.' },
        author: { type: 'string', description: 'Author name.' },
        tags: { type: 'string', description: 'Comma-separated tags.' },
        image: { type: 'json', description: 'Image object: { "src": "https://..." } — src must be a public HTTPS URL.' },
        published: { type: 'boolean', description: 'Whether the article is published.' },
        published_at: { type: 'string', description: 'ISO 8601 publish timestamp.' },
        metafields: { type: 'array', items: { type: 'json' }, description: 'Metafields to update on the article.' },
      },
      async execute(args, exec) {
        required(args, ['blog_id', 'article_id']);
        const body = await client.rest('PUT', `/blogs/${args.blog_id}/articles/${args.article_id}`, {
          body: {
            article: defined({
              title: args.title,
              body_html: args.body_html,
              summary_html: args.summary_html,
              author: args.author,
              tags: args.tags,
              image: asObject(args.image),
              published: args.published,
              published_at: args.published_at,
              metafields: args.metafields,
            }),
          },
          signal: exec.signal,
        });
        return { article: body.article };
      },
    },
    {
      name: 'shopify_delete_article',
      title: 'Delete blog article',
      kind: 'write',
      description:
        'Permanently deletes an article. blog_id and article_id are numeric REST ids. Irreversible — confirm with the user before executing. Requires write_content scope.',
      parameters: {
        blog_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the blog containing the article.' },
        article_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the article to delete.' },
      },
      async execute(args, exec) {
        required(args, ['blog_id', 'article_id']);
        await client.rest('DELETE', `/blogs/${args.blog_id}/articles/${args.article_id}`, { signal: exec.signal });
        return { deleted: true, article_id: args.article_id };
      },
    },
    {
      name: 'shopify_count_articles',
      title: 'Count blog articles',
      kind: 'read',
      description:
        "Counts the articles of one blog (blog_id required). Supports the same date filters as shopify_list_blog_articles (ISO 8601, evaluated in the shop's timezone) plus published_status. Returns { count }.",
      parameters: {
        blog_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the blog.' },
        created_at_min: { type: 'string', description: 'ISO 8601 — only articles created at or after this time.' },
        created_at_max: { type: 'string', description: 'ISO 8601 — only articles created at or before this time.' },
        updated_at_min: { type: 'string', description: 'ISO 8601 — only articles updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 — only articles updated at or before this time.' },
        published_at_min: { type: 'string', description: 'ISO 8601 — only articles published at or after this time.' },
        published_at_max: { type: 'string', description: 'ISO 8601 — only articles published at or before this time.' },
        published_status: { type: 'string', enum: ['published', 'unpublished', 'any'], description: 'Filter by published state. Default any.' },
      },
      async execute(args, exec) {
        required(args, ['blog_id']);
        const body = await client.rest('GET', `/blogs/${args.blog_id}/articles/count`, {
          query: defined({
            created_at_min: args.created_at_min,
            created_at_max: args.created_at_max,
            updated_at_min: args.updated_at_min,
            updated_at_max: args.updated_at_max,
            published_at_min: args.published_at_min,
            published_at_max: args.published_at_max,
            published_status: args.published_status,
          }),
          signal: exec.signal,
        });
        return { count: body.count };
      },
    },
    {
      name: 'shopify_list_article_tags',
      title: 'List article tags',
      kind: 'read',
      description:
        "Lists the tags used across all of the store's articles (GET /articles/tags). Use popular=true to return only the most-used tags. Returns { tags } — an array of tag strings.",
      parameters: {
        limit: { type: 'integer', description: 'Maximum tags to return (default 50).' },
        popular: { type: 'boolean', description: 'When true, only the most popular tags are returned.' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', '/articles/tags', {
          query: defined({ limit: args.limit, popular: args.popular }),
          signal: exec.signal,
        });
        return { tags: body.tags };
      },
    },
    // ------------------------------------------------------------------
    // Comments
    // ------------------------------------------------------------------
    {
      name: 'shopify_list_comments',
      title: 'List comments',
      kind: 'read',
      description:
        "Lists article comments (all blogs by default). status: pending|published|unapproved; also filter by blog_id / article_id (numeric REST ids) and created/updated/published_at min/max (ISO 8601, shop timezone — see shopify_get_shop_details) plus published_status. Loop with page_info until next_page_info is null.",
      parameters: {
        limit: { type: 'integer', description: 'Maximum comments per page (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only comments with id greater than this numeric REST id.' },
        fields: { type: 'string', description: 'Comma-separated subset of comment fields, e.g. "id,body,author,status".' },
        status: { type: 'string', enum: ['pending', 'published', 'unapproved'], description: 'Filter by moderation status: pending, published, or unapproved.' },
        blog_id: { type: 'string', description: 'Only comments on articles of this blog (numeric REST id).' },
        article_id: { type: 'string', description: 'Only comments on this article (numeric REST id).' },
        created_at_min: { type: 'string', description: 'ISO 8601 — only comments created at or after this time.' },
        created_at_max: { type: 'string', description: 'ISO 8601 — only comments created at or before this time.' },
        updated_at_min: { type: 'string', description: 'ISO 8601 — only comments updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 — only comments updated at or before this time.' },
        published_at_min: { type: 'string', description: 'ISO 8601 — only comments published at or after this time.' },
        published_at_max: { type: 'string', description: 'ISO 8601 — only comments published at or before this time.' },
        published_status: { type: 'string', enum: ['published', 'unpublished', 'any'], description: 'Filter by published state. Default any.' },
        page_info: { type: 'string', description: "Cursor from a previous response's next_page_info; when present, only limit/fields may accompany it." },
      },
      async execute(args, exec) {
        const query = args.page_info
          ? defined({ page_info: args.page_info, limit: args.limit, fields: args.fields })
          : defined({
              limit: args.limit,
              since_id: args.since_id,
              fields: args.fields,
              status: args.status,
              blog_id: args.blog_id,
              article_id: args.article_id,
              created_at_min: args.created_at_min,
              created_at_max: args.created_at_max,
              updated_at_min: args.updated_at_min,
              updated_at_max: args.updated_at_max,
              published_at_min: args.published_at_min,
              published_at_max: args.published_at_max,
              published_status: args.published_status,
            });
        const { items, next_page_info } = await client.list('/comments', query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_create_article_comment',
      title: 'Create article comment',
      kind: 'write',
      description:
        'Creates a comment on an article. body, email, author, blog_id and article_id are all required (blog_id/article_id as integers). The comment is created with status pending and must be approved via shopify_approve_comment before it appears on the storefront. Requires write_content scope.',
      parameters: {
        body: { type: 'string', required: true, description: 'REQUIRED. Comment body text.' },
        email: { type: 'string', required: true, description: 'REQUIRED. Commenter email.' },
        author: { type: 'string', required: true, description: 'REQUIRED. Commenter display name.' },
        blog_id: { type: 'integer', required: true, description: 'REQUIRED. Numeric REST id of the blog.' },
        article_id: { type: 'integer', required: true, description: 'REQUIRED. Numeric REST id of the article.' },
        ip: { type: 'string', description: 'Commenter IP address.' },
        user_agent: { type: 'string', description: 'Commenter user agent string.' },
      },
      async execute(args, exec) {
        required(args, ['body', 'email', 'author', 'blog_id', 'article_id']);
        const body = await client.rest('POST', '/comments', {
          body: {
            comment: defined({
              body: args.body,
              email: args.email,
              author: args.author,
              blog_id: args.blog_id,
              article_id: args.article_id,
              ip: args.ip,
              user_agent: args.user_agent,
            }),
          },
          signal: exec.signal,
        });
        return { comment: body.comment };
      },
    },
    {
      name: 'shopify_approve_comment',
      title: 'Approve comment',
      kind: 'write',
      description:
        "Approves a pending comment so it becomes visible on the storefront (POST /comments/{comment_id}/approve). comment_id is the numeric REST id. Requires write_content scope.",
      parameters: {
        comment_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the comment to approve.' },
      },
      async execute(args, exec) {
        required(args, ['comment_id']);
        const body = await client.rest('POST', `/comments/${args.comment_id}/approve`, { signal: exec.signal });
        return { comment: body.comment };
      },
    },
    {
      name: 'shopify_remove_comment',
      title: 'Remove comment',
      kind: 'write',
      description:
        'Removes a comment from the storefront (status becomes removed; it is not deleted). comment_id is the numeric REST id. Requires write_content scope.',
      parameters: {
        comment_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the comment to remove.' },
      },
      async execute(args, exec) {
        required(args, ['comment_id']);
        const body = await client.rest('POST', `/comments/${args.comment_id}/remove`, { signal: exec.signal });
        return { comment: body.comment };
      },
    },
    {
      name: 'shopify_mark_comment_as_spam',
      title: 'Mark comment as spam',
      kind: 'write',
      description:
        'Marks a comment as spam (status becomes spam). comment_id is the numeric REST id. Requires write_content scope.',
      parameters: {
        comment_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the comment to mark as spam.' },
      },
      async execute(args, exec) {
        required(args, ['comment_id']);
        const body = await client.rest('POST', `/comments/${args.comment_id}/spam`, { signal: exec.signal });
        return { comment: body.comment };
      },
    },
    {
      name: 'shopify_mark_comment_as_not_spam',
      title: 'Mark comment as not spam',
      kind: 'write',
      description:
        'Restores a comment previously marked as spam (status back to pending). comment_id is the numeric REST id. Requires write_content scope.',
      parameters: {
        comment_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the comment to restore.' },
      },
      async execute(args, exec) {
        required(args, ['comment_id']);
        const body = await client.rest('POST', `/comments/${args.comment_id}/not_spam`, { signal: exec.signal });
        return { comment: body.comment };
      },
    },
    // ------------------------------------------------------------------
    // Pages
    // ------------------------------------------------------------------
    {
      name: 'shopify_list_pages',
      title: 'List pages',
      kind: 'read',
      description:
        "Lists the store's pages (static content, e.g. About / Contact). Filter by title, handle, created/updated/published_at min/max (ISO 8601, shop timezone — see shopify_get_shop_details) and published_status. Loop with page_info until next_page_info is null.",
      parameters: {
        limit: { type: 'integer', description: 'Maximum pages per page (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only pages with id greater than this numeric REST id.' },
        fields: { type: 'string', description: 'Comma-separated subset of page fields, e.g. "id,title,handle".' },
        title: { type: 'string', description: 'Filter by page title.' },
        handle: { type: 'string', description: 'Filter by page handle (URL slug).' },
        created_at_min: { type: 'string', description: 'ISO 8601 — only pages created at or after this time.' },
        created_at_max: { type: 'string', description: 'ISO 8601 — only pages created at or before this time.' },
        updated_at_min: { type: 'string', description: 'ISO 8601 — only pages updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 — only pages updated at or before this time.' },
        published_at_min: { type: 'string', description: 'ISO 8601 — only pages published at or after this time.' },
        published_at_max: { type: 'string', description: 'ISO 8601 — only pages published at or before this time.' },
        published_status: { type: 'string', enum: ['published', 'unpublished', 'any'], description: 'Filter by published state. Default any.' },
        page_info: { type: 'string', description: "Cursor from a previous response's next_page_info; when present, only limit/fields may accompany it." },
      },
      async execute(args, exec) {
        const query = args.page_info
          ? defined({ page_info: args.page_info, limit: args.limit, fields: args.fields })
          : defined({
              limit: args.limit,
              since_id: args.since_id,
              fields: args.fields,
              title: args.title,
              handle: args.handle,
              created_at_min: args.created_at_min,
              created_at_max: args.created_at_max,
              updated_at_min: args.updated_at_min,
              updated_at_max: args.updated_at_max,
              published_at_min: args.published_at_min,
              published_at_max: args.published_at_max,
              published_status: args.published_status,
            });
        const { items, next_page_info } = await client.list('/pages', query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_page',
      title: 'Get page',
      kind: 'read',
      description:
        'Gets a single page by its numeric REST id (page_id, string or integer). Pass fields to trim the response, e.g. fields=id,title,handle,body_html.',
      parameters: {
        page_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the page.' },
        fields: { type: 'string', description: 'Comma-separated subset of page fields to return.' },
      },
      async execute(args, exec) {
        required(args, ['page_id']);
        const body = await client.rest('GET', `/pages/${args.page_id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { page: body.page };
      },
    },
    {
      name: 'shopify_create_page',
      title: 'Create page',
      kind: 'write',
      description:
        'Creates a page. title is required; body_html carries the page content (HTML allowed); handle is the URL slug (defaults from title). New pages are created as drafts (published=false) unless published is true / published_at is set.',
      parameters: {
        title: { type: 'string', required: true, description: 'REQUIRED. Page title.' },
        body_html: { type: 'string', description: 'Page body in HTML.' },
        author: { type: 'string', description: 'Author name.' },
        handle: { type: 'string', description: 'URL slug (e.g. "about-us"); defaults from the title if omitted.' },
        published: { type: 'boolean', description: 'Whether the page is published. Default false.' },
        published_at: { type: 'string', description: 'ISO 8601 publish timestamp; implies published=true.' },
        template_suffix: { type: 'string', description: 'Suffix of the Liquid template used for this page (e.g. "contact"); must not be "page".' },
        metafields: { type: 'array', items: { type: 'json' }, description: 'Optional metafields to create with the page.' },
      },
      async execute(args, exec) {
        required(args, ['title']);
        const body = await client.rest('POST', '/pages', {
          body: {
            page: defined({
              title: args.title,
              body_html: args.body_html,
              author: args.author,
              handle: args.handle,
              published: args.published,
              published_at: args.published_at,
              template_suffix: args.template_suffix,
              metafields: args.metafields,
            }),
          },
          signal: exec.signal,
        });
        return { page: body.page };
      },
    },
    {
      name: 'shopify_update_page',
      title: 'Update page',
      kind: 'write',
      description:
        'Updates an existing page (title, body_html, author, handle, published, published_at, template_suffix, metafields). page_id is the numeric REST id. To publish a draft, set published=true.',
      parameters: {
        page_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the page to update.' },
        title: { type: 'string', description: 'New page title.' },
        body_html: { type: 'string', description: 'Page body in HTML.' },
        author: { type: 'string', description: 'Author name.' },
        handle: { type: 'string', description: 'URL slug — changing it breaks existing links.' },
        published: { type: 'boolean', description: 'Whether the page is published.' },
        published_at: { type: 'string', description: 'ISO 8601 publish timestamp.' },
        template_suffix: { type: 'string', description: 'Suffix of the Liquid template used for this page.' },
        metafields: { type: 'array', items: { type: 'json' }, description: 'Metafields to update on the page.' },
      },
      async execute(args, exec) {
        required(args, ['page_id']);
        const body = await client.rest('PUT', `/pages/${args.page_id}`, {
          body: {
            page: defined({
              title: args.title,
              body_html: args.body_html,
              author: args.author,
              handle: args.handle,
              published: args.published,
              published_at: args.published_at,
              template_suffix: args.template_suffix,
              metafields: args.metafields,
            }),
          },
          signal: exec.signal,
        });
        return { page: body.page };
      },
    },
    {
      name: 'shopify_delete_page',
      title: 'Delete page',
      kind: 'write',
      description:
        'Permanently deletes a page. page_id is the numeric REST id. Irreversible — confirm with the user before executing. Requires write_content scope.',
      parameters: {
        page_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the page to delete.' },
      },
      async execute(args, exec) {
        required(args, ['page_id']);
        await client.rest('DELETE', `/pages/${args.page_id}`, { signal: exec.signal });
        return { deleted: true, page_id: args.page_id };
      },
    },
    {
      name: 'shopify_count_pages',
      title: 'Count pages',
      kind: 'read',
      description:
        "Counts the store's pages. Supports the same filters as shopify_list_pages (title, created/updated/published_at min/max, published_status). Returns { count }.",
      parameters: {
        title: { type: 'string', description: 'Count only pages whose title matches.' },
        created_at_min: { type: 'string', description: 'ISO 8601 — only pages created at or after this time.' },
        created_at_max: { type: 'string', description: 'ISO 8601 — only pages created at or before this time.' },
        updated_at_min: { type: 'string', description: 'ISO 8601 — only pages updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 — only pages updated at or before this time.' },
        published_at_min: { type: 'string', description: 'ISO 8601 — only pages published at or after this time.' },
        published_at_max: { type: 'string', description: 'ISO 8601 — only pages published at or before this time.' },
        published_status: { type: 'string', enum: ['published', 'unpublished', 'any'], description: 'Filter by published state. Default any.' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', '/pages/count', {
          query: defined({
            title: args.title,
            created_at_min: args.created_at_min,
            created_at_max: args.created_at_max,
            updated_at_min: args.updated_at_min,
            updated_at_max: args.updated_at_max,
            published_at_min: args.published_at_min,
            published_at_max: args.published_at_max,
            published_status: args.published_status,
          }),
          signal: exec.signal,
        });
        return { count: body.count };
      },
    },
  ];
}
