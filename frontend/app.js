const tokenKey = "shocialgram.token";
const themeKey = "shocialgram.theme";
const view = document.querySelector("#view");
const toast = document.querySelector("#toast");
const dialogs = [...document.querySelectorAll("dialog")];
const postDialog = document.querySelector("#post-dialog");
let currentUser = null;
let currentPage = "feed";
let profileUsername = null;
let authMode = "login";
let toastTimer;
let postDetailRequest = 0;
let postDialogCloseTimer;
let editPostRequest = 0;
let sharePostRequest = 0;
let sharePostId = null;
let selectedShareRecipient = null;
let connectionUsername = null;
let connectionKind = null;
let connectionUsers = [];
let connectionRequestId = 0;
let shareSearchRequestId = 0;
let shareSearchUsers = [];
let shareSearchTimer;
let messageConversations = [];
let activeConversation = null;
let messagesUnreadCount = 0;
let messagePageRequest = 0;
let messageHistoryRequest = 0;
let messageSearchQuery = "";
let newMessageUsers = [];
let newMessageRequest = 0;
let newMessageSearchTimer;
const selectedImages = new WeakMap();

const demoProfileImages = {
  el_dev: "/assets/dummy/profiles/el-dev-profile.jpg",
  john_doe: "/assets/dummy/profiles/john-doe-profile.jpg",
  maria_jane: "/assets/dummy/profiles/maria-jane-profile.jpg",
  alex_chen: "/assets/dummy/profiles/alex-chen-profile.jpg",
};

const missingDemoProfilePaths = {
  "uploads/john.jpg": "john_doe",
  "uploads/maria.jpg": "maria_jane",
  "uploads/alex.jpg": "alex_chen",
};

const demoPostImages = {
  "uploads/my-first-post.jpg": "/assets/dummy/posts/welcome-coffee-post.jpg",
  "uploads/john-city.jpg": "/assets/dummy/posts/city-exploration-post.jpg",
};

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function api(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  const token = localStorage.getItem(tokenKey);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  return fetch(`/api${path}`, { ...options, headers }).then(async (response) => {
    if (response.status === 204) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && token) {
        localStorage.removeItem(tokenKey);
        currentUser = null;
        updateAuthUI();
      }
      throw new Error(body.error || "Something went wrong. Please try again.");
    }
    return body;
  });
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}

function showDialogFeedback(id, message) {
  const feedback = document.querySelector(`#${id}`);
  feedback.textContent = message;
  feedback.hidden = false;
}

function updateAuthUI() {
  document.querySelectorAll("[data-auth-label]").forEach((element) => {
    element.textContent = currentUser ? "Log out" : "Log in";
  });
  if (!currentUser) updateMessageBadge(0);
}

function updateMessageBadge(count) {
  messagesUnreadCount = count;
  document.querySelectorAll("[data-message-badge]").forEach((badge) => {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count < 1;
    badge.setAttribute("aria-label", count ? `${count} unread messages` : "");
  });
}

async function loadMessageBadge() {
  if (!currentUser) return;
  const userId = currentUser.id;
  try {
    const { unreadCount } = await api("/messages");
    if (currentUser?.id !== userId) return;
    updateMessageBadge(unreadCount);
  } catch (error) {
    notify(error.message);
  }
}

function imageSource(path) {
  return /^(?:https?:)?\/\//i.test(path) || path.startsWith("/") ? path : `/${path}`;
}

function avatar(user, className = "avatar") {
  const label = escapeHTML(user?.username?.slice(0, 1).toUpperCase() || "?");
  const demoImage = demoProfileImages[user?.username];
  const storedPath = user?.profilePicture?.replace(/^\/+/, "");
  const missingDemoImage = Boolean(storedPath && missingDemoProfilePaths[storedPath] === user?.username);
  const source = user?.profilePicture && !missingDemoImage ? imageSource(user.profilePicture) : demoImage;
  const fallback = demoImage && source !== demoImage
    ? ` data-image-fallback="${escapeHTML(demoImage)}"`
    : "";
  return source
    ? `<img class="${className}" src="${escapeHTML(source)}"${fallback} alt="${escapeHTML(user.username)}'s profile photo">`
    : `<span class="${className}" aria-label="${escapeHTML(user?.username || "User")}">${label}</span>`;
}

function postImageSource(post) {
  const demoImage = demoPostImages[post.imageUrl.replace(/^\/+/, "")];
  return demoImage || imageSource(post.imageUrl);
}

function postImageAttributes(post) {
  return `src="${escapeHTML(postImageSource(post))}"`;
}

function commentIcon() {
  return '<svg class="action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.2 11.6a8.2 8.2 0 0 1-8.3 8.2 8.5 8.5 0 0 1-3.6-.8L3 20l1.2-4.8a8.1 8.1 0 1 1 16-3.6Z"></path><circle cx="8.1" cy="11.7" r=".75"></circle><circle cx="12" cy="11.7" r=".75"></circle><circle cx="15.9" cy="11.7" r=".75"></circle></svg>';
}

function shareIcon() {
  return '<svg class="action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>';
}

document.addEventListener("error", (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.dataset.imageFallback) return;
  image.src = image.dataset.imageFallback;
  delete image.dataset.imageFallback;
}, true);

function formattedDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function formattedTimestamp(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function setPageTitle(title) {
  document.querySelector("#page-title").textContent = title;
}

function showLoading() {
  view.setAttribute("aria-busy", "true");
  view.innerHTML = '<div class="skeleton" aria-label="Loading content"></div>';
}

function showError(error) {
  view.setAttribute("aria-busy", "false");
  view.innerHTML = `<div class="empty-state"><div class="empty-emoji">☁</div><h2>We hit a small snag</h2><p>${escapeHTML(error.message)}</p><button class="button button-outline" data-action="retry">Try again</button></div>`;
}

function emptyState(title, message, actionLabel = "", action = "") {
  return `<div class="empty-state"><div class="empty-emoji">✳</div><h2>${escapeHTML(title)}</h2><p>${escapeHTML(message)}</p>${actionLabel ? `<button class="button button-coral" data-action="${action}">${escapeHTML(actionLabel)}</button>` : ""}</div>`;
}

function renderMessageContent(content) {
  return escapeHTML(content).replace(/(https?:\/\/[^\s<]+)/g, (url) => (
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  ));
}

function renderConversationList() {
  const query = messageSearchQuery.toLowerCase();
  const conversations = [...messageConversations];
  if (activeConversation && !conversations.some(({ user }) => user.id === activeConversation.id)) {
    conversations.unshift({ user: activeConversation, lastMessage: null, unreadCount: 0 });
  }
  const filtered = conversations.filter(({ user, lastMessage }) => (
    user.username.toLowerCase().includes(query)
    || (user.fullName || "").toLowerCase().includes(query)
    || (lastMessage?.content || "").toLowerCase().includes(query)
  ));
  if (!filtered.length) {
    return `<div class="conversation-empty"><p>${conversations.length ? "No conversations match your search." : "No conversations yet."}</p>${conversations.length ? "" : '<button class="text-button" type="button" data-action="new-message">Start a conversation</button>'}</div>`;
  }
  return filtered.map(({ user, lastMessage, unreadCount }) => {
    const preview = lastMessage
      ? `${lastMessage.senderId === currentUser.id ? "You: " : ""}${lastMessage.content}`
      : "Start a conversation";
    return `<button class="conversation-item ${activeConversation?.id === user.id ? "is-active" : ""}" type="button" data-action="select-conversation" data-user-id="${escapeHTML(user.id)}" aria-pressed="${activeConversation?.id === user.id}">
      <span class="conversation-avatar">${avatar(user)}</span>
      <span class="conversation-copy">
        <span class="conversation-title"><strong>${escapeHTML(user.username)}</strong>${lastMessage ? `<time datetime="${escapeHTML(lastMessage.createdAt)}">${formattedDate(lastMessage.createdAt)}</time>` : ""}</span>
        <span class="conversation-preview">${escapeHTML(preview)}</span>
      </span>
      ${unreadCount ? `<span class="conversation-unread" aria-label="${unreadCount} unread messages"></span>` : ""}
    </button>`;
  }).join("");
}

function renderMessageBubbles(messages) {
  return messages.length
    ? messages.map((message) => {
        const outgoing = message.senderId === currentUser.id;
        return `<article class="message-line ${outgoing ? "is-outgoing" : "is-incoming"}">
          <div class="message-bubble">${renderMessageContent(message.content)}</div>
          <time datetime="${escapeHTML(message.createdAt)}">${formattedTimestamp(message.createdAt)}</time>
        </article>`;
      }).join("")
    : '<p class="message-history-empty">No messages yet. Say hello to start the conversation.</p>';
}

function renderMessageChat(user, messages = null) {
  if (!user) {
    return `<div class="messages-empty">
      <span class="messages-empty-icon">${commentIcon()}</span>
      <h2>Your messages</h2>
      <p>Send a message to start a chat</p>
      <button class="button button-outline" type="button" data-action="new-message">Send message</button>
    </div>`;
  }
  const profileUrl = `/@${encodeURIComponent(user.username)}`;
  return `<header class="message-chat-header">
      <button class="chat-back" type="button" data-action="back-to-conversations" aria-label="Back to conversations">‹</button>
      <a class="chat-avatar" href="${profileUrl}" data-profile="${escapeHTML(user.username)}">${avatar(user)}</a>
      <a class="chat-user-copy" href="${profileUrl}" data-profile="${escapeHTML(user.username)}"><strong>${escapeHTML(user.username)}</strong><span>${escapeHTML(user.fullName || "")}</span></a>
    </header>
    <div id="message-history" class="message-history" role="log" aria-live="polite" aria-label="Conversation with ${escapeHTML(user.username)}">
      ${messages === null ? '<div class="message-history-loading"><span></span><span></span><span></span></div>' : renderMessageBubbles(messages)}
    </div>
    ${messages === null ? "" : `<form id="message-form" class="message-compose" data-user-id="${escapeHTML(user.id)}">
      <textarea name="content" rows="1" maxlength="2200" placeholder="Write a message..." aria-label="Write a message" required></textarea>
      <button class="button button-coral" type="submit" disabled>Send</button>
    </form>`}`;
}

function renderMessagesLayout() {
  const hasActiveConversation = Boolean(activeConversation);
  view.innerHTML = `<div class="messages-layout ${hasActiveConversation ? "has-active-conversation" : ""}">
    <aside class="messages-inbox" aria-label="Conversations">
      <header class="messages-inbox-header">
        <div><h2>${escapeHTML(currentUser.username)}</h2></div>
        <button class="new-message-button" type="button" data-action="new-message" aria-label="New message">＋</button>
      </header>
      <label class="message-search"><span aria-hidden="true">⌕</span><input id="message-conversation-search" type="search" value="${escapeHTML(messageSearchQuery)}" placeholder="Search conversations" autocomplete="off" aria-label="Search conversations"></label>
      <div id="message-conversation-list" class="message-conversation-list">${renderConversationList()}</div>
    </aside>
    <section id="message-chat" class="message-chat" aria-label="Chat">${renderMessageChat(activeConversation)}</section>
  </div>`;
  view.setAttribute("aria-busy", "false");
}

async function openMessageConversation(user) {
  activeConversation = user;
  const requestId = ++messageHistoryRequest;
  const chat = document.querySelector("#message-chat");
  if (!chat) {
    renderMessagesLayout();
  }
  document.querySelector(".messages-layout")?.classList.add("has-active-conversation");
  document.querySelector("#message-chat").innerHTML = renderMessageChat(user);
  const list = document.querySelector("#message-conversation-list");
  if (list) list.innerHTML = renderConversationList();

  try {
    const { user: conversationUser, messages } = await api(`/messages/${encodeURIComponent(user.id)}`);
    if (requestId !== messageHistoryRequest || currentPage !== "messages") return;
    const previousUnreadCount = messageConversations.find(({ user: peer }) => peer.id === user.id)?.unreadCount || 0;
    messageConversations = messageConversations.map((conversation) => (
      conversation.user.id === user.id ? { ...conversation, unreadCount: 0 } : conversation
    ));
    updateMessageBadge(Math.max(0, messagesUnreadCount - previousUnreadCount));
    activeConversation = conversationUser;
    document.querySelector("#message-chat").innerHTML = renderMessageChat(conversationUser, messages);
    document.querySelector("#message-conversation-list").innerHTML = renderConversationList();
    document.querySelector("#message-history").scrollTop = document.querySelector("#message-history").scrollHeight;
  } catch (error) {
    if (requestId !== messageHistoryRequest || currentPage !== "messages") return;
    const chatPanel = document.querySelector("#message-chat");
    if (chatPanel) chatPanel.innerHTML = `<div class="message-load-error"><p>Couldn't load this conversation.</p><span>${escapeHTML(error.message)}</span></div>`;
    notify(error.message);
  }
}

async function renderMessages() {
  setPageTitle("Messages");
  activeConversation = null;
  messageSearchQuery = "";
  const requestId = ++messagePageRequest;
  view.setAttribute("aria-busy", "true");
  messageConversations = [];
  if (!currentUser) {
    view.innerHTML = emptyState("Your messages", "Log in to see conversations and send messages.", "Log in", "auth");
    view.setAttribute("aria-busy", "false");
    return;
  }
  view.innerHTML = '<div class="messages-layout messages-loading"><div class="messages-inbox"><div class="skeleton"></div></div><div class="messages-chat"><div class="skeleton"></div></div></div>';
  try {
    const { conversations, unreadCount } = await api("/messages");
    if (requestId !== messagePageRequest || currentPage !== "messages") return;
    messageConversations = conversations;
    updateMessageBadge(unreadCount);
    renderMessagesLayout();
  } catch (error) {
    if (requestId === messagePageRequest && currentPage === "messages") showError(error);
  } finally {
    if (requestId === messagePageRequest && currentPage === "messages") view.setAttribute("aria-busy", "false");
  }
}

function renderPostMenu(post, className = "") {
  const isOwner = currentUser?.id === post.userId;
  return `<div class="post-menu-wrap ${className}" data-post-id="${escapeHTML(post.id)}">
    <button class="more-button" type="button" data-action="post-menu-toggle" aria-label="Post options" aria-haspopup="menu" aria-expanded="false">···</button>
    <div class="post-action-menu" role="menu" hidden>
      ${isOwner ? '<button type="button" role="menuitem" data-action="edit-post">Edit post</button><button type="button" role="menuitem" class="danger-menu-item" data-action="delete-post">Delete post</button>' : ""}
      <button type="button" role="menuitem" data-action="copy-post-link">Copy link</button>
      <button type="button" role="menuitem" data-action="share-post">Share</button>
    </div>
  </div>`;
}

function renderPostTile(post, username = post.user.username) {
  return `<div class="post-tile" data-post-id="${escapeHTML(post.id)}">
    <button class="post-tile-open" type="button" data-action="open-post" data-id="${escapeHTML(post.id)}" aria-label="Open post by ${escapeHTML(username)}">
      <img ${postImageAttributes(post)} alt="Post by ${escapeHTML(username)}" loading="lazy">
    </button>
    ${renderPostMenu(post, "post-menu-grid")}
  </div>`;
}

function renderPost(post) {
  const userLink = `/@${encodeURIComponent(post.user.username)}`;
  return `<article class="post-card" data-post-id="${escapeHTML(post.id)}">
    <header class="post-header">
      <a href="${userLink}" data-profile="${escapeHTML(post.user.username)}">${avatar(post.user)}</a>
      <div class="post-author"><a href="${userLink}" data-profile="${escapeHTML(post.user.username)}">${escapeHTML(post.user.username)}</a><time datetime="${escapeHTML(post.createdAt)}">${formattedDate(post.createdAt)}</time></div>
      ${renderPostMenu(post)}
    </header>
    <button class="post-image-trigger" type="button" data-action="open-post" data-id="${escapeHTML(post.id)}" aria-label="Open post by ${escapeHTML(post.user.username)}">
      <img class="post-image" ${postImageAttributes(post)} alt="Photo posted by ${escapeHTML(post.user.username)}" loading="lazy">
    </button>
    <div class="post-actions">
      <button class="action-button ${post.liked ? "liked" : ""}" data-action="like" aria-label="${post.liked ? "Unlike" : "Like"} post" aria-pressed="${Boolean(post.liked)}">${post.liked ? "♥" : "♡"}</button>
      <button class="action-button" data-action="comments" aria-label="View comments">${commentIcon()}</button>
      <button class="action-button" data-action="share-post" aria-label="Share post">${shareIcon()}</button>
    </div>
    <p class="likes-count"><span data-likes-count>${post._count?.likes ?? 0}</span> likes</p>
    <p class="post-caption"><strong>${escapeHTML(post.user.username)}</strong>${escapeHTML(post.caption)}</p>
    <button class="comments-link" data-action="comments">View all ${post._count?.comments ?? 0} comments</button>
  </article>`;
}

function renderComment(comment) {
  const userLink = `/@${encodeURIComponent(comment.user.username)}`;
  return `<article class="detail-comment">
    <a class="detail-comment-avatar" href="${userLink}" data-profile="${escapeHTML(comment.user.username)}">${avatar(comment.user, "avatar")}</a>
    <div class="detail-comment-copy">
      <p><a href="${userLink}" data-profile="${escapeHTML(comment.user.username)}"><strong>${escapeHTML(comment.user.username)}</strong></a> ${escapeHTML(comment.content)}</p>
      <time datetime="${escapeHTML(comment.createdAt)}">${formattedTimestamp(comment.createdAt)}</time>
      ${currentUser?.id === comment.userId ? `<button class="comment-delete" data-action="delete-comment" data-comment-id="${escapeHTML(comment.id)}" data-post-id="${escapeHTML(comment.postId)}" aria-label="Delete comment">×</button>` : ""}
    </div>
  </article>`;
}

function renderPostDetail(post) {
  const userLink = `/@${encodeURIComponent(post.user.username)}`;
  const comments = post.comments ?? [];
  const liked = Boolean(post.liked);
  return `<div class="post-detail-layout" data-post-id="${escapeHTML(post.id)}">
    <section class="post-detail-media" aria-label="Post image">
      <img class="detail-image" ${postImageAttributes(post)} alt="Post by ${escapeHTML(post.user.username)}">
    </section>
    <section class="post-detail-info" aria-label="Post details">
      <header class="post-detail-header">
        <a class="detail-author-avatar" href="${userLink}" data-profile="${escapeHTML(post.user.username)}">${avatar(post.user, "avatar")}</a>
        <div class="detail-author-copy">
          <a href="${userLink}" data-profile="${escapeHTML(post.user.username)}"><strong>${escapeHTML(post.user.username)}</strong></a>
          ${post.user.fullName ? `<span>${escapeHTML(post.user.fullName)}</span>` : ""}
        </div>
        ${renderPostMenu(post)}
      </header>
      <div class="post-detail-scroll">
        <article class="detail-caption-row">
          <a class="detail-comment-avatar" href="${userLink}" data-profile="${escapeHTML(post.user.username)}">${avatar(post.user, "avatar")}</a>
          <div class="detail-comment-copy">
            <p><a href="${userLink}" data-profile="${escapeHTML(post.user.username)}"><strong>${escapeHTML(post.user.username)}</strong></a> ${escapeHTML(post.caption || "")}</p>
            <time datetime="${escapeHTML(post.createdAt)}">${formattedTimestamp(post.createdAt)}</time>
          </div>
        </article>
        <section class="detail-comments" aria-label="Comments">
          ${comments.length ? comments.map(renderComment).join("") : '<p class="detail-comments-empty">No comments yet. Be the first to comment.</p>'}
        </section>
      </div>
      <footer class="post-detail-footer">
        <div class="detail-actions">
          <button class="action-button ${liked ? "liked" : ""}" data-action="like" aria-label="${liked ? "Unlike" : "Like"} post" aria-pressed="${liked}">${liked ? "♥" : "♡"}</button>
          <button class="action-button" data-action="focus-comment" aria-label="Write a comment">${commentIcon()}</button>
          <button class="action-button" data-action="share-post" aria-label="Share post">${shareIcon()}</button>
        </div>
        <p class="detail-likes"><span data-likes-count>${post._count?.likes ?? 0}</span> likes</p>
        <time class="detail-posted-date" datetime="${escapeHTML(post.createdAt)}">${formattedDate(post.createdAt)}</time>
        ${currentUser
          ? `<form class="comment-form detail-comment-form" data-post-id="${escapeHTML(post.id)}"><input id="post-comment-input" name="content" required maxlength="2200" placeholder="Add a comment..." aria-label="Add a comment"><button class="button button-coral" type="submit">Post</button></form>`
          : '<p class="detail-login-prompt">Log in to like or comment.</p>'}
      </footer>
    </section>
  </div>`;
}

function closePostDialog() {
  if (!postDialog.open || postDialog.classList.contains("is-closing")) return;
  postDialog.classList.add("is-closing");
  clearTimeout(postDialogCloseTimer);
  postDialogCloseTimer = setTimeout(() => {
    if (postDialog.classList.contains("is-closing")) postDialog.close();
  }, 180);
}

postDialog.addEventListener("click", (event) => {
  if (event.target === postDialog) closePostDialog();
});
postDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closePostDialog();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (document.querySelector(".post-action-menu:not([hidden])")) {
    closePostMenus();
    event.preventDefault();
    return;
  }
  const focusedDialog = document.activeElement?.closest("dialog");
  const topDialog = focusedDialog || [...dialogs].reverse().find((dialog) => dialog.open);
  if (topDialog && topDialog !== postDialog) {
    event.preventDefault();
    topDialog.close();
    syncDialogScrollLock();
    return;
  }
  if (!postDialog.open) return;
  event.preventDefault();
  closePostDialog();
});
postDialog.addEventListener("close", () => {
  clearTimeout(postDialogCloseTimer);
  postDialog.classList.remove("is-closing");
  delete postDialog.dataset.postId;
  syncDialogScrollLock();
  postDetailRequest += 1;
});

async function openPage(page, username = null) {
  currentPage = page;
  profileUsername = username;
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  document.querySelector("#search-results").hidden = true;
  if (page === "feed") return renderFeed();
  if (page === "explore") return renderExplore();
  if (page === "profile") return renderProfile(username);
  if (page === "messages") return renderMessages();
  setPageTitle("Notifications");
  view.innerHTML = emptyState("A quieter kind of social", "Notifications will appear here when someone likes, comments on, or follows you.");
}

async function renderFeed() {
  setPageTitle("Home");
  if (!currentUser) {
    view.innerHTML = `<div class="feed-layout"><div class="feed-column">${emptyState("Good things are happening here", "Sign in to see the posts from people you follow and share your own perspective.", "Log in", "auth")}</div></div>`;
    view.setAttribute("aria-busy", "false");
    return;
  }
  showLoading();
  try {
    const { posts } = await api("/posts/feed");
    const timeline = posts.length
      ? posts.map(renderPost).join("")
      : emptyState(
          "Your feed is a blank canvas",
          "Follow a few people to see their latest moments here, or share something of your own.",
          "Explore people",
          "go-explore",
        );
    view.innerHTML = `<div class="feed-layout"><div class="feed-column"><div class="feed-heading"><div><h2>Fresh perspectives</h2><p>A little inspiration from your corner of the world.</p></div></div>${timeline}</div><aside class="side-card"><h3>Make room for good things.</h3><p>Follow people whose perspective makes your day a little more interesting.</p><button class="button button-outline" data-action="go-explore">Find your people</button></aside></div>`;
  } catch (error) { showError(error); }
  finally {
    view.setAttribute("aria-busy", "false");
  }
}

async function renderExplore() {
  setPageTitle("Explore");
  showLoading();
  try {
    const { posts } = await api("/posts/explore");
    view.innerHTML = posts.length
      ? `<div class="explore-grid">${posts.map((post) => renderPostTile(post)).join("")}</div>`
      : emptyState("The good stuff is just starting", "When people start sharing, their recent photos will find a home here.");
  } catch (error) { showError(error); }
  finally { view.setAttribute("aria-busy", "false"); }
}

async function renderProfile(username) {
  showLoading();
  try {
    const { user, counts, isFollowing, posts } = await api(`/users/${encodeURIComponent(username)}`);
    setPageTitle(`@${user.username}`);
    const isOwn = currentUser?.id === user.id;
    view.innerHTML = `<section class="profile-head">
      <div class="profile-avatar">${avatar(user, "avatar")}</div>
      <div class="profile-meta">
        <h2>${escapeHTML(user.username)}</h2>
        ${isOwn ? '<button class="button button-outline" data-action="edit-profile">Edit profile</button>' : currentUser ? `<button class="button ${isFollowing ? "button-outline" : "button-coral"}" data-action="follow" data-user-id="${escapeHTML(user.id)}">${isFollowing ? "Following" : "Follow"}</button>` : ""}
        <div class="profile-stats">
          <span><strong>${counts.posts}</strong> posts</span>
          <button data-action="connections" data-kind="followers" data-username="${escapeHTML(user.username)}"><strong data-followers>${counts.followers}</strong> followers</button>
          <button data-action="connections" data-kind="following" data-username="${escapeHTML(user.username)}"><strong data-following>${counts.following}</strong> following</button>
        </div>
        <p class="profile-bio"><strong>${escapeHTML(user.fullName)}</strong>${user.bio ? `<br>${escapeHTML(user.bio)}` : ""}</p>
      </div>
    </section>
    <div class="profile-divider">POSTS</div>
    ${posts.length ? `<div class="profile-grid">${posts.map((post) => renderPostTile(post, user.username)).join("")}</div>` : emptyState(isOwn ? "Your gallery starts here" : "No posts yet", isOwn ? "Share a photo and let people see the world through your eyes." : "This profile hasn't shared any photos yet.", isOwn ? "Create your first post" : "", isOwn ? "create" : "")}`;
  } catch (error) { showError(error); }
  finally { view.setAttribute("aria-busy", "false"); }
}

function openDialog(id) {
  const dialog = document.querySelector(`#${id}`);
  if (!dialog.open) dialog.showModal();
  syncDialogScrollLock();
}

function closeDialogs() {
  dialogs.forEach((dialog) => dialog.close());
  syncDialogScrollLock();
}

function syncDialogScrollLock() {
  document.body.classList.toggle("modal-open", dialogs.some((dialog) => dialog.open));
}

function closePostMenus() {
  document.querySelectorAll(".post-action-menu:not([hidden])").forEach((menu) => {
    menu.hidden = true;
    menu.parentElement.querySelector("[data-action='post-menu-toggle']")?.setAttribute("aria-expanded", "false");
  });
}

function clearImagePicker(uploader) {
  const input = uploader.querySelector("[data-image-input]");
  const preview = uploader.querySelector("[data-image-preview]");
  const previewUrl = preview.dataset.objectUrl;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  delete preview.dataset.objectUrl;
  preview.removeAttribute("src");
  uploader.querySelector("[data-image-preview-panel]").hidden = true;
  uploader.querySelector("[data-image-browse]").hidden = false;
  uploader.querySelector("[data-image-file-name]").textContent = "";
  uploader.querySelector("[data-image-error]").textContent = "";
  uploader.querySelector("[data-image-error]").hidden = true;
  uploader.classList.remove("is-dragging", "has-error");
  input.value = "";
  selectedImages.delete(uploader);
}

function chooseImage(uploader, file) {
  const error = uploader.querySelector("[data-image-error]");
  if (!file.type || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    clearImagePicker(uploader);
    error.textContent = "Choose a JPG, JPEG, PNG, or WebP image.";
    error.hidden = false;
    uploader.classList.add("has-error");
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    clearImagePicker(uploader);
    error.textContent = "This image is larger than 8 MB. Choose a smaller file.";
    error.hidden = false;
    uploader.classList.add("has-error");
    return;
  }

  clearImagePicker(uploader);
  selectedImages.set(uploader, file);
  const preview = uploader.querySelector("[data-image-preview]");
  const previewUrl = URL.createObjectURL(file);
  preview.dataset.objectUrl = previewUrl;
  preview.src = previewUrl;
  uploader.querySelector("[data-image-file-name]").textContent = file.name;
  uploader.querySelector("[data-image-preview-panel]").hidden = false;
  uploader.querySelector("[data-image-browse]").hidden = true;
}

document.querySelectorAll("[data-image-uploader]").forEach((uploader) => {
  const input = uploader.querySelector('input[type="file"]');
  uploader.querySelectorAll("[data-image-browse], [data-image-change]").forEach((button) => {
    button.addEventListener("click", () => input.click());
  });
  uploader.querySelector("[data-image-remove]").addEventListener("click", () => clearImagePicker(uploader));
  input.addEventListener("change", () => {
    if (input.files[0]) chooseImage(uploader, input.files[0]);
  });
  uploader.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploader.classList.add("is-dragging");
  });
  uploader.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget || !uploader.contains(event.relatedTarget)) uploader.classList.remove("is-dragging");
  });
  uploader.addEventListener("drop", (event) => {
    event.preventDefault();
    uploader.classList.remove("is-dragging");
    if (event.dataTransfer.files.length > 1) {
      clearImagePicker(uploader);
      const error = uploader.querySelector("[data-image-error]");
      error.textContent = "Drop one image at a time.";
      error.hidden = false;
      uploader.classList.add("has-error");
      return;
    }
    if (event.dataTransfer.files[0]) chooseImage(uploader, event.dataTransfer.files[0]);
  });
});

dialogs.forEach((dialog) => {
  if (dialog !== postDialog) {
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      dialog.close();
      syncDialogScrollLock();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      dialog.close();
      syncDialogScrollLock();
    });
  }
  dialog.addEventListener("close", () => {
    dialog.querySelectorAll("[data-image-uploader]").forEach(clearImagePicker);
    syncDialogScrollLock();
    if (dialog.id === "share-dialog") {
      clearTimeout(shareSearchTimer);
      shareSearchRequestId += 1;
      sharePostRequest += 1;
      sharePostId = null;
      selectedShareRecipient = null;
      shareSearchUsers = [];
    } else if (dialog.id === "connections-dialog") {
      connectionRequestId += 1;
    } else if (dialog.id === "new-message-dialog") {
      clearTimeout(newMessageSearchTimer);
      newMessageRequest += 1;
      newMessageUsers = [];
    }
  });
});

function openAuth() {
  if (currentUser) {
    localStorage.removeItem(tokenKey);
    currentUser = null;
    messageConversations = [];
    activeConversation = null;
    updateAuthUI();
    notify("You’re logged out.");
    openPage("feed");
    return;
  }
  authMode = "login";
  updateAuthMode();
  openDialog("auth-dialog");
}

function updateAuthMode() {
  const registering = authMode === "register";
  document.querySelector("#auth-title").textContent = registering ? "Create account" : "Log in";
  document.querySelector("#register-fields").hidden = !registering;
  document.querySelector("#register-fields input[name=username]").required = registering;
  document.querySelector("#register-fields input[name=fullName]").required = registering;
  document.querySelector("#auth-switch-copy").textContent = registering ? "Already with us?" : "New here?";
  document.querySelector('[data-action="auth-mode"]').textContent = registering ? "Log in" : "Create an account";
  document.querySelector("#auth-form [name=password]").autocomplete = registering ? "new-password" : "current-password";
}

async function openPost(id) {
  const target = document.querySelector("#post-detail");
  const requestId = ++postDetailRequest;
  clearTimeout(postDialogCloseTimer);
  document.querySelector("#post-action-feedback").hidden = true;
  closePostMenus();
  postDialog.classList.remove("is-closing");
  postDialog.dataset.postId = id;
  target.innerHTML = '<div class="post-detail-state"><div class="skeleton" aria-label="Loading post"></div><p>Loading post...</p></div>';
  if (!postDialog.open) postDialog.showModal();
  syncDialogScrollLock();
  try {
    const { post } = await api(`/posts/${encodeURIComponent(id)}`);
    if (requestId !== postDetailRequest || !postDialog.open) return;
    target.innerHTML = renderPostDetail(post);
  } catch (error) {
    if (requestId !== postDetailRequest || !postDialog.open) return;
    target.innerHTML = `<div class="post-detail-state"><p>We couldn't load this post.</p><p>${escapeHTML(error.message)}</p><button class="button button-outline" data-action="retry-post-detail" data-id="${escapeHTML(id)}">Try again</button></div>`;
  }
}

function postShareUrl(id) {
  const url = new URL("/", window.location.origin);
  url.searchParams.set("post", id);
  return url.toString();
}

async function copyText(text) {
  let clipboardError;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      clipboardError = error;
    }
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) {
    throw new Error(clipboardError
      ? "Clipboard access failed, and your browser could not copy the link."
      : "Your browser could not copy the link.");
  }
}

async function copyPostLink(id) {
  await copyText(postShareUrl(id));
  closePostMenus();
  if (document.querySelector("#share-dialog").open) showDialogFeedback("share-feedback", "Link copied!");
  if (postDialog.open) showDialogFeedback("post-action-feedback", "Link copied!");
  notify("Link copied!");
}

async function openEditPost(id) {
  if (!currentUser) return openAuth();
  closePostMenus();
  const requestId = ++editPostRequest;
  const dialog = document.querySelector("#edit-post-dialog");
  const form = document.querySelector("#edit-post-form");
  const submit = form.querySelector('[type="submit"]');
  const image = document.querySelector("#edit-post-image");
  const status = document.querySelector("#edit-post-status");
  let loaded = false;
  form.dataset.postId = id;
  form.elements.caption.value = "";
  document.querySelector("#edit-post-feedback").hidden = true;
  image.removeAttribute("src");
  image.hidden = true;
  status.hidden = false;
  status.textContent = "Loading post…";
  submit.disabled = true;
  openDialog("edit-post-dialog");
  try {
    const { post } = await api(`/posts/${encodeURIComponent(id)}`);
    if (requestId !== editPostRequest || !dialog.open) return;
    form.elements.caption.value = post.caption || "";
    image.src = postImageSource(post);
    image.hidden = false;
    status.hidden = true;
    loaded = true;
  } catch (error) {
    if (requestId === editPostRequest && dialog.open) {
      status.textContent = error.message;
      notify(error.message);
    }
  } finally {
    if (requestId === editPostRequest && dialog.open) submit.disabled = !loaded;
  }
}

function openDeletePost(id) {
  if (!currentUser) return openAuth();
  closePostMenus();
  document.querySelector("#delete-post-form").dataset.postId = id;
  document.querySelector("#delete-post-feedback").hidden = true;
  openDialog("delete-post-dialog");
}

async function openSharePost(id) {
  closePostMenus();
  const requestId = ++sharePostRequest;
  sharePostId = id;
  selectedShareRecipient = null;
  shareSearchUsers = [];
  shareSearchRequestId += 1;
  const preview = document.querySelector("#share-post-preview");
  const chatPanel = document.querySelector("#share-chat-panel");
  const results = document.querySelector("#share-user-results");
  const sendButton = document.querySelector("#send-post-share");
  document.querySelector("#share-user-search").value = "";
  document.querySelector("#share-feedback").hidden = true;
  chatPanel.hidden = true;
  results.innerHTML = "";
  sendButton.disabled = true;
  sendButton.textContent = "Choose a recipient";
  document.querySelector("#share-whatsapp-link").href = "#";
  preview.innerHTML = '<div class="share-preview-loading"><div class="skeleton"></div><span>Loading post…</span></div>';
  openDialog("share-dialog");
  try {
    const { post } = await api(`/posts/${encodeURIComponent(id)}`);
    if (requestId !== sharePostRequest || !document.querySelector("#share-dialog").open) return;
    const url = postShareUrl(id);
    preview.innerHTML = `<img ${postImageAttributes(post)} alt=""><div><strong>@${escapeHTML(post.user.username)}</strong><p>${escapeHTML(post.caption || "A moment from Shocialgram")}</p></div>`;
    document.querySelector("#share-whatsapp-link").href = `https://wa.me/?text=${encodeURIComponent(`Check out this post on Shocialgram: ${url}`)}`;
    results.innerHTML = '<p class="share-hint">Search for a username to choose someone.</p>';
  } catch (error) {
    if (requestId === sharePostRequest && document.querySelector("#share-dialog").open) {
      preview.innerHTML = `<p class="share-error">${escapeHTML(error.message)}</p>`;
      notify(error.message);
    }
  }
}

function renderShareUsers(users) {
  const results = document.querySelector("#share-user-results");
  if (!users.length) {
    results.innerHTML = '<p class="share-hint">No people found.</p>';
    return;
  }
  results.innerHTML = users.map((user) => {
    const selected = selectedShareRecipient?.id === user.id;
    return `<button class="share-user-row ${selected ? "is-selected" : ""}" type="button" data-action="select-share-recipient" data-user-id="${escapeHTML(user.id)}" aria-pressed="${selected}">
      ${avatar(user)}
      <span><strong>@${escapeHTML(user.username)}</strong><small>${escapeHTML(user.fullName || "Shocialgram member")}</small></span>
      <span class="share-user-check" aria-hidden="true">${selected ? "✓" : ""}</span>
    </button>`;
  }).join("");
}

function updateShareRecipientButton() {
  const button = document.querySelector("#send-post-share");
  button.disabled = !selectedShareRecipient;
  button.textContent = selectedShareRecipient ? `Send to @${selectedShareRecipient.username}` : "Choose a recipient";
}

function renderConnections() {
  const list = document.querySelector("#connections-list");
  const query = document.querySelector("#connections-search-input").value.trim().toLowerCase();
  const users = connectionUsers.filter((user) => (
    user.username.toLowerCase().includes(query) || (user.fullName || "").toLowerCase().includes(query)
  ));
  if (!connectionUsers.length) {
    list.innerHTML = '<div class="connection-state"><span aria-hidden="true">✳</span><strong>No connections yet</strong><p>This list will grow as people connect.</p></div>';
    return;
  }
  if (!users.length) {
    list.innerHTML = '<div class="connection-state"><strong>No matches</strong><p>Try another username or name.</p></div>';
    return;
  }
  list.innerHTML = users.map((user) => {
    const isSelf = currentUser?.id === user.id;
    const action = !currentUser ? "auth" : isSelf ? "" : "connection-follow";
    const label = isSelf ? "You" : user.isFollowing ? "Following" : connectionKind === "followers" ? "Follow back" : "Follow";
    const buttonClass = user.isFollowing ? "button button-outline" : "button button-coral";
    return `<article class="connection-row" data-user-id="${escapeHTML(user.id)}">
      <a class="connection-avatar" href="/@${encodeURIComponent(user.username)}" data-profile="${escapeHTML(user.username)}">${avatar(user)}</a>
      <a class="connection-copy" href="/@${encodeURIComponent(user.username)}" data-profile="${escapeHTML(user.username)}"><strong>${escapeHTML(user.username)}</strong><span>${escapeHTML(user.fullName || "")}</span></a>
      ${action ? `<button class="${buttonClass}" type="button" data-action="${action}" data-user-id="${escapeHTML(user.id)}" ${isSelf ? "disabled" : ""}>${label}</button>` : '<span class="connection-you">You</span>'}
    </article>`;
  }).join("");
}

async function openConnections(username, kind) {
  connectionUsername = username;
  connectionKind = kind;
  connectionUsers = [];
  document.querySelector("#connections-title").textContent = kind === "followers" ? "Followers" : "Following";
  document.querySelector("#connections-search-input").value = "";
  document.querySelector("#connections-feedback").hidden = true;
  document.querySelector("#connections-list").innerHTML = '<div class="connection-skeleton"><span></span><span></span><span></span><span></span></div>';
  const requestId = ++connectionRequestId;
  openDialog("connections-dialog");
  try {
    const { users } = await api(`/users/${encodeURIComponent(username)}/${kind}`);
    if (requestId !== connectionRequestId || !document.querySelector("#connections-dialog").open) return;
    connectionUsers = users;
    renderConnections();
  } catch (error) {
    if (requestId === connectionRequestId) {
      document.querySelector("#connections-list").innerHTML = `<div class="connection-state"><strong>Couldn't load this list</strong><p>${escapeHTML(error.message)}</p></div>`;
      showDialogFeedback("connections-feedback", error.message);
      notify(error.message);
    }
  }
}

document.addEventListener("click", async (event) => {
  if (!event.target.closest(".post-menu-wrap")) closePostMenus();
  const profileLink = event.target.closest("[data-profile]");
  if (profileLink) {
    event.preventDefault();
    const sourceDialog = profileLink.closest("dialog");
    if (sourceDialog && sourceDialog !== postDialog) {
      sourceDialog.close();
      syncDialogScrollLock();
    }
    if (postDialog.open) closePostDialog();
    return openPage("profile", profileLink.dataset.profile);
  }
  const control = event.target.closest("[data-action], [data-page]");
  if (!control) {
    if (!event.target.closest("#search-results")) document.querySelector("#search-results").hidden = true;
    return;
  }
  if (control.dataset.page) return openPage(control.dataset.page);

  const card = control.closest("[data-post-id]");
  const action = control.dataset.action;
  try {
    if (action === "theme") {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem(themeKey, next);
      document.querySelectorAll("[data-theme-label]").forEach((label) => { label.textContent = next === "dark" ? "Light mode" : "Dark mode"; });
    } else if (action === "auth") openAuth();
    else if (action === "auth-mode") {
      authMode = authMode === "login" ? "register" : "login";
      updateAuthMode();
    } else if (action === "close-dialog") {
      control.closest("dialog")?.close();
      syncDialogScrollLock();
    }
    else if (action === "close-post-detail") closePostDialog();
    else if (action === "retry-post-detail") return openPost(control.dataset.id);
    else if (action === "focus-comment") document.querySelector("#post-comment-input")?.focus();
    else if (action === "create") {
      if (!currentUser) return openAuth();
      openDialog("create-dialog");
    } else if (action === "new-message") {
      if (!currentUser) return openAuth();
      newMessageUsers = [];
      document.querySelector("#new-message-search-input").value = "";
      document.querySelector("#new-message-results").innerHTML = '<p class="share-hint">Search for a username to start a chat.</p>';
      openDialog("new-message-dialog");
      document.querySelector("#new-message-search-input").focus();
    } else if (action === "select-message-user") {
      const user = newMessageUsers.find((candidate) => candidate.id === control.dataset.userId);
      if (!user) return;
      document.querySelector("#new-message-dialog").close();
      syncDialogScrollLock();
      if (currentPage !== "messages") await openPage("messages");
      if (currentPage !== "messages") return;
      return openMessageConversation(user);
    } else if (action === "select-conversation") {
      const conversation = messageConversations.find(({ user }) => user.id === control.dataset.userId);
      const user = conversation?.user || (activeConversation?.id === control.dataset.userId ? activeConversation : null);
      if (user) return openMessageConversation(user);
    } else if (action === "back-to-conversations") {
      activeConversation = null;
      messageHistoryRequest += 1;
      renderMessagesLayout();
    } else if (action === "my-profile") {
      if (!currentUser) return openAuth();
      return openPage("profile", currentUser.username);
    } else if (action === "go-explore") return openPage("explore");
    else if (action === "retry") return openPage(currentPage, profileUsername);
    else if (action === "edit-profile") {
      const form = document.querySelector("#profile-form");
      form.username.value = currentUser.username;
      form.fullName.value = currentUser.fullName;
      form.bio.value = currentUser.bio;
      openDialog("profile-dialog");
    } else if (action === "post-menu-toggle") {
      const menu = control.parentElement.querySelector(".post-action-menu");
      const willOpen = menu.hidden;
      closePostMenus();
      menu.hidden = !willOpen;
      control.setAttribute("aria-expanded", String(willOpen));
    } else if (action === "edit-post") {
      return openEditPost(card?.dataset.postId);
    } else if (action === "delete-post") {
      return openDeletePost(card?.dataset.postId);
    } else if (action === "copy-post-link") {
      return await copyPostLink(control.dataset.postId || card?.dataset.postId || sharePostId);
    } else if (action === "share-post") {
      return openSharePost(card?.dataset.postId);
    } else if (action === "share-chat") {
      if (!currentUser) return openAuth();
      const panel = document.querySelector("#share-chat-panel");
      panel.hidden = false;
      document.querySelector("#share-user-search").focus();
    } else if (action === "select-share-recipient") {
      selectedShareRecipient = shareSearchUsers.find((user) => user.id === control.dataset.userId) || null;
      renderShareUsers(shareSearchUsers);
      updateShareRecipientButton();
    } else if (action === "send-post-share") {
      if (!currentUser || !sharePostId || !selectedShareRecipient) return;
      control.disabled = true;
      control.textContent = "Sending…";
      try {
        await api("/messages/share-post", {
          method: "POST",
          body: JSON.stringify({ postId: sharePostId, receiverId: selectedShareRecipient.id }),
        });
        document.querySelector("#share-dialog").close();
        syncDialogScrollLock();
        notify("Post shared in chat.");
      } catch (error) {
        showDialogFeedback("share-feedback", error.message);
        updateShareRecipientButton();
        throw error;
      }
    } else if (action === "like") {
      if (!currentUser) return openAuth();
      const { liked, likesCount } = await api(`/posts/${card.dataset.postId}/likes`, { method: "POST" });
      control.classList.toggle("liked", liked);
      control.textContent = liked ? "♥" : "♡";
      control.setAttribute("aria-label", `${liked ? "Unlike" : "Like"} post`);
      control.setAttribute("aria-pressed", String(liked));
      const count = card.querySelector("[data-likes-count]");
      if (count) count.textContent = likesCount;
    } else if (action === "comments" || action === "open-post") {
      return openPost(control.dataset.id || card?.dataset.postId);
    } else if (action === "follow") {
      const result = await api(`/users/${control.dataset.userId}/follow`, { method: "POST" });
      notify(result.following ? "You’re now following this account." : "You unfollowed this account.");
      return openPage("profile", profileUsername);
    } else if (action === "connection-follow") {
      control.disabled = true;
      let following;
      try {
        ({ following } = await api(`/users/${control.dataset.userId}/follow`, { method: "POST" }));
      } catch (error) {
        control.disabled = false;
        showDialogFeedback("connections-feedback", error.message);
        throw error;
      }
      notify(following ? "You’re now following this account." : "You unfollowed this account.");
      if (currentPage === "profile" && profileUsername === connectionUsername) {
        await openPage("profile", profileUsername);
      }
      return openConnections(connectionUsername, connectionKind);
    } else if (action === "connections") {
      return openConnections(control.dataset.username, control.dataset.kind);
    } else if (action === "delete-comment") {
      if (!confirm("Delete this comment?")) return;
      await api(`/posts/${control.dataset.postId}/comments/${control.dataset.commentId}`, { method: "DELETE" });
      await openPost(control.dataset.postId);
    }
  } catch (error) {
    if (control.closest("#share-dialog")) showDialogFeedback("share-feedback", error.message);
    if (control.closest("#connections-dialog")) showDialogFeedback("connections-feedback", error.message);
    notify(error.message);
  }
});

document.querySelector("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    const endpoint = authMode === "register" ? "/auth/register" : "/auth/login";
    const result = await api(endpoint, { method: "POST", body: JSON.stringify(data) });
    localStorage.setItem(tokenKey, result.token);
    currentUser = result.user;
    updateAuthUI();
    void loadMessageBadge();
    closeDialogs();
    form.reset();
    notify(authMode === "register" ? "Welcome to Shocialgram!" : "Welcome back.");
    openPage("feed");
  } catch (error) { notify(error.message); }
});

document.querySelector("#create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const uploader = form.querySelector("[data-image-uploader]");
  const image = selectedImages.get(uploader);
  if (!image) {
    const error = uploader.querySelector("[data-image-error]");
    error.textContent = "Choose an image before sharing your post.";
    error.hidden = false;
    uploader.classList.add("has-error");
    return;
  }
  const data = new FormData(form);
  data.set("image", image, image.name);
  try {
    await api("/posts", { method: "POST", body: data });
    closeDialogs();
    form.reset();
    notify("Your post is live.");
    openPage("feed");
  } catch (error) { notify(error.message); }
});

document.querySelector("#profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  try {
    const { user } = await api("/users/me", {
      method: "PATCH",
      body: JSON.stringify({ username: fields.get("username"), fullName: fields.get("fullName"), bio: fields.get("bio") }),
    });
    const image = selectedImages.get(form.querySelector("[data-image-uploader]"));
    if (image) {
      const avatarData = new FormData();
      avatarData.set("image", image, image.name);
      const result = await api("/users/me/avatar", { method: "POST", body: avatarData });
      currentUser = result.user;
    } else currentUser = user;
    closeDialogs();
    notify("Profile updated.");
    openPage("profile", currentUser.username);
  } catch (error) { notify(error.message); }
});

document.querySelector("#edit-post-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const postId = form.dataset.postId;
  if (!postId) return;
  const submit = form.querySelector('[type="submit"]');
  const dialog = document.querySelector("#edit-post-dialog");
  const reopenDetail = postDialog.open && postDialog.dataset.postId === postId;
  submit.disabled = true;
  submit.textContent = "Saving…";
  try {
    await api(`/posts/${encodeURIComponent(postId)}`, {
      method: "PATCH",
      body: JSON.stringify({ caption: form.elements.caption.value }),
    });
    dialog.close();
    notify("Post updated.");
    await openPage(currentPage, profileUsername);
    if (reopenDetail) await openPost(postId);
  } catch (error) {
    showDialogFeedback("edit-post-feedback", error.message);
    notify(error.message);
  } finally {
    if (dialog.open) {
      submit.disabled = false;
      submit.textContent = "Save changes";
    }
  }
});

document.querySelector("#delete-post-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const postId = form.dataset.postId;
  if (!postId) return;
  const submit = form.querySelector('[type="submit"]');
  const dialog = document.querySelector("#delete-post-dialog");
  const reopenDetail = postDialog.open && postDialog.dataset.postId === postId;
  submit.disabled = true;
  submit.textContent = "Deleting…";
  try {
    await api(`/posts/${encodeURIComponent(postId)}`, { method: "DELETE" });
    dialog.close();
    if (reopenDetail) closePostDialog();
    notify("Post deleted.");
    await openPage(currentPage, profileUsername);
  } catch (error) {
    showDialogFeedback("delete-post-feedback", error.message);
    notify(error.message);
  } finally {
    if (dialog.open) {
      submit.disabled = false;
      submit.textContent = "Delete post";
    }
  }
});

document.querySelector("#post-detail").addEventListener("submit", async (event) => {
  if (!event.target.matches(".comment-form")) return;
  event.preventDefault();
  const form = event.target;
  try {
    await api(`/posts/${form.dataset.postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content: new FormData(form).get("content") }),
    });
    await openPost(form.dataset.postId);
  } catch (error) { notify(error.message); }
});

document.addEventListener("submit", async (event) => {
  if (!event.target.matches("#message-form")) return;
  event.preventDefault();
  const form = event.target;
  const content = form.elements.content.value.trim();
  const peer = activeConversation;
  if (!peer || !content) return;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  submit.textContent = "Sending…";
  try {
    const { message } = await api("/messages", {
      method: "POST",
      body: JSON.stringify({ receiverId: peer.id, content }),
    });
    if (currentPage === "messages") {
      const previous = messageConversations.filter(({ user }) => user.id !== peer.id);
      messageConversations = [
        { user: peer, lastMessage: message, unreadCount: 0 },
        ...previous,
      ];
      const list = document.querySelector("#message-conversation-list");
      if (list) list.innerHTML = renderConversationList();
    }
    notify("Message sent.");
    if (currentPage === "messages" && activeConversation?.id === peer.id) {
      await openMessageConversation(peer);
    }
  } catch (error) {
    const feedback = document.querySelector("#message-send-feedback");
    if (feedback) {
      feedback.textContent = error.message;
      feedback.hidden = false;
    }
    notify(error.message);
    if (submit.isConnected) {
      submit.disabled = false;
      submit.textContent = "Send";
    }
  }
});

document.addEventListener("input", (event) => {
  if (event.target.matches("#message-form textarea")) {
    const submit = event.target.closest("form").querySelector('[type="submit"]');
    submit.disabled = !event.target.value.trim();
    return;
  }
  if (event.target.matches("#message-conversation-search")) {
    messageSearchQuery = event.target.value.trim();
    const list = document.querySelector("#message-conversation-list");
    if (list) list.innerHTML = renderConversationList();
  }
});

let searchTimer;
document.querySelector("#user-search").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  const query = event.target.value.trim();
  const resultPanel = document.querySelector("#search-results");
  if (query.length < 2) {
    resultPanel.hidden = true;
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const { users } = await api(`/users/search?q=${encodeURIComponent(query)}`);
      resultPanel.innerHTML = users.length ? users.map((user) => `<div class="search-result" data-profile="${escapeHTML(user.username)}">${avatar(user)}<span>${escapeHTML(user.fullName)}<small>@${escapeHTML(user.username)} · ${user.counts.followers} followers</small></span></div>`).join("") : '<p class="search-result">No people found.</p>';
      resultPanel.hidden = false;
    } catch (error) { notify(error.message); }
  }, 220);
});

document.querySelector("#connections-search-input").addEventListener("input", renderConnections);

document.querySelector("#share-user-search").addEventListener("input", (event) => {
  clearTimeout(shareSearchTimer);
  const query = event.target.value.trim();
  const results = document.querySelector("#share-user-results");
  const requestId = ++shareSearchRequestId;
  if (query.length < 2) {
    shareSearchUsers = [];
    results.innerHTML = '<p class="share-hint">Search with at least two characters.</p>';
    return;
  }
  results.innerHTML = '<div class="share-search-loading"><span></span><span></span><span></span></div>';
  shareSearchTimer = setTimeout(async () => {
    try {
      const { users } = await api(`/users/search?q=${encodeURIComponent(query)}`);
      if (requestId !== shareSearchRequestId || !document.querySelector("#share-dialog").open) return;
      shareSearchUsers = users.filter((user) => user.id !== currentUser?.id);
      renderShareUsers(shareSearchUsers);
    } catch (error) {
      if (requestId !== shareSearchRequestId) return;
      results.innerHTML = `<p class="share-error">${escapeHTML(error.message)}</p>`;
      notify(error.message);
    }
  }, 220);
});

document.querySelector("#new-message-search-input").addEventListener("input", (event) => {
  clearTimeout(newMessageSearchTimer);
  const query = event.target.value.trim();
  const results = document.querySelector("#new-message-results");
  const requestId = ++newMessageRequest;
  if (query.length < 2) {
    newMessageUsers = [];
    results.innerHTML = '<p class="share-hint">Search with at least two characters.</p>';
    return;
  }
  results.innerHTML = '<div class="share-search-loading"><span></span><span></span><span></span></div>';
  newMessageSearchTimer = setTimeout(async () => {
    try {
      const { users } = await api(`/users/search?q=${encodeURIComponent(query)}`);
      if (requestId !== newMessageRequest || !document.querySelector("#new-message-dialog").open) return;
      newMessageUsers = users.filter((user) => user.id !== currentUser?.id);
      results.innerHTML = newMessageUsers.length
        ? newMessageUsers.map((user) => `<button class="new-message-user" type="button" data-action="select-message-user" data-user-id="${escapeHTML(user.id)}">${avatar(user)}<span><strong>@${escapeHTML(user.username)}</strong><small>${escapeHTML(user.fullName || "Shocialgram member")}</small></span><span aria-hidden="true">›</span></button>`).join("")
        : '<p class="share-hint">No people found.</p>';
    } catch (error) {
      if (requestId !== newMessageRequest) return;
      results.innerHTML = `<p class="share-error">${escapeHTML(error.message)}</p>`;
      notify(error.message);
    }
  }, 220);
});

document.documentElement.dataset.theme = localStorage.getItem(themeKey) || "light";
document.querySelectorAll("[data-theme-label]").forEach((label) => {
  label.textContent = document.documentElement.dataset.theme === "dark" ? "Light mode" : "Dark mode";
});
updateAuthUI();

if (localStorage.getItem(tokenKey)) {
  api("/auth/me")
    .then(({ user }) => { currentUser = user; updateAuthUI(); })
    .catch(() => localStorage.removeItem(tokenKey))
    .finally(async () => {
      await openPage("feed");
      if (currentUser) await loadMessageBadge();
      const sharedPostId = new URLSearchParams(window.location.search).get("post");
      if (sharedPostId) await openPost(sharedPostId);
    });
} else {
  openPage("feed");
  const sharedPostId = new URLSearchParams(window.location.search).get("post");
  if (sharedPostId) openPost(sharedPostId);
}
