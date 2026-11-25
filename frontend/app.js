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

function updateAuthUI() {
  document.querySelectorAll("[data-auth-label]").forEach((element) => {
    element.textContent = currentUser ? "Log out" : "Log in";
  });
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

function postImageAttributes(post) {
  const demoImage = demoPostImages[post.imageUrl.replace(/^\/+/, "")];
  return `src="${escapeHTML(demoImage || imageSource(post.imageUrl))}"`;
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

function setPageTitle(kicker, title) {
  document.querySelector("#page-kicker").textContent = kicker;
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

function renderPost(post) {
  const userLink = `/@${encodeURIComponent(post.user.username)}`;
  return `<article class="post-card" data-post-id="${escapeHTML(post.id)}">
    <header class="post-header">
      <a href="${userLink}" data-profile="${escapeHTML(post.user.username)}">${avatar(post.user)}</a>
      <div class="post-author"><a href="${userLink}" data-profile="${escapeHTML(post.user.username)}">${escapeHTML(post.user.username)}</a><time datetime="${escapeHTML(post.createdAt)}">${formattedDate(post.createdAt)}</time></div>
      ${currentUser?.id === post.userId ? `<button class="more-button" data-action="post-menu" aria-label="Post options">···</button>` : ""}
    </header>
    <button class="post-image-trigger" type="button" data-action="open-post" data-id="${escapeHTML(post.id)}" aria-label="Open post by ${escapeHTML(post.user.username)}">
      <img class="post-image" ${postImageAttributes(post)} alt="Photo posted by ${escapeHTML(post.user.username)}" loading="lazy">
    </button>
    <div class="post-actions">
      <button class="action-button ${post.liked ? "liked" : ""}" data-action="like" aria-label="${post.liked ? "Unlike" : "Like"} post" aria-pressed="${Boolean(post.liked)}">${post.liked ? "♥" : "♡"}</button>
      <button class="action-button" data-action="comments" aria-label="View comments">♧</button>
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
        ${currentUser?.id === post.userId ? '<button class="more-button" data-action="post-menu" aria-label="Post options">···</button>' : ""}
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
          <button class="action-button" data-action="focus-comment" aria-label="Write a comment">♧</button>
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
  if (event.key !== "Escape" || !postDialog.open) return;
  const focusedDialog = document.activeElement?.closest("dialog");
  if (focusedDialog && focusedDialog !== postDialog) return;
  event.preventDefault();
  closePostDialog();
});
postDialog.addEventListener("close", () => {
  clearTimeout(postDialogCloseTimer);
  postDialog.classList.remove("is-closing");
  document.body.classList.remove("post-modal-open");
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
  setPageTitle("STAY IN THE LOOP", "Notifications");
  view.innerHTML = emptyState("A quieter kind of social", "Notifications will appear here when someone likes, comments on, or follows you.");
}

async function renderFeed() {
  setPageTitle("YOUR DAILY EDIT", "Home");
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
  setPageTitle("A LITTLE INSPIRATION", "Explore");
  showLoading();
  try {
    const { posts } = await api("/posts/explore");
    view.innerHTML = posts.length
      ? `<div class="explore-grid">${posts.map((post) => `<button data-action="open-post" data-id="${escapeHTML(post.id)}" aria-label="Open post by ${escapeHTML(post.user.username)}"><img ${postImageAttributes(post)} alt="Post by ${escapeHTML(post.user.username)}" loading="lazy"></button>`).join("")}</div>`
      : emptyState("The good stuff is just starting", "When people start sharing, their recent photos will find a home here.");
  } catch (error) { showError(error); }
  finally { view.setAttribute("aria-busy", "false"); }
}

async function renderProfile(username) {
  showLoading();
  try {
    const { user, counts, isFollowing, posts } = await api(`/users/${encodeURIComponent(username)}`);
    setPageTitle("A LITTLE ABOUT THEM", `@${user.username}`);
    const isOwn = currentUser?.id === user.id;
    view.innerHTML = `<section class="profile-head">
      <div class="profile-avatar">${avatar(user, "avatar")}</div>
      <div class="profile-meta">
        <h2>${escapeHTML(user.username)}</h2>
        ${isOwn ? '<button class="button button-outline" data-action="edit-profile">Edit profile</button>' : currentUser ? `<button class="button ${isFollowing ? "button-outline" : "button-coral"}" data-action="follow" data-user-id="${escapeHTML(user.id)}">${isFollowing ? "Following" : "Follow"}</button>` : ""}
        <div class="profile-stats">
          <span><strong>${counts.posts}</strong> posts</span>
          <button data-action="connections" data-kind="followers" data-username="${escapeHTML(user.username)}"><strong data-followers>${counts.followers}</strong> followers</button>
          <button data-action="connections" data-kind="following" data-username="${escapeHTML(user.username)}"><strong>${counts.following}</strong> following</button>
        </div>
        <p class="profile-bio"><strong>${escapeHTML(user.fullName)}</strong>${user.bio ? `<br>${escapeHTML(user.bio)}` : ""}</p>
      </div>
    </section>
    <div class="profile-divider">POSTS</div>
    ${posts.length ? `<div class="profile-grid">${posts.map((post) => `<button data-action="open-post" data-id="${escapeHTML(post.id)}" aria-label="Open post"><img ${postImageAttributes(post)} alt="Post by ${escapeHTML(user.username)}" loading="lazy"></button>`).join("")}</div>` : emptyState(isOwn ? "Your gallery starts here" : "No posts yet", isOwn ? "Share a photo and let people see the world through your eyes." : "This profile hasn't shared any photos yet.", isOwn ? "Create your first post" : "", isOwn ? "create" : "")}`;
  } catch (error) { showError(error); }
  finally { view.setAttribute("aria-busy", "false"); }
}

function openDialog(id) {
  const dialog = document.querySelector(`#${id}`);
  if (!dialog.open) dialog.showModal();
}

function closeDialogs() {
  dialogs.forEach((dialog) => dialog.close());
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
  dialog.addEventListener("close", () => {
    dialog.querySelectorAll("[data-image-uploader]").forEach(clearImagePicker);
  });
});

function openAuth() {
  if (currentUser) {
    localStorage.removeItem(tokenKey);
    currentUser = null;
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
  postDialog.classList.remove("is-closing");
  document.body.classList.add("post-modal-open");
  target.innerHTML = '<div class="post-detail-state"><div class="skeleton" aria-label="Loading post"></div><p>Loading post...</p></div>';
  if (!postDialog.open) postDialog.showModal();
  try {
    const { post } = await api(`/posts/${encodeURIComponent(id)}`);
    if (requestId !== postDetailRequest || !postDialog.open) return;
    target.innerHTML = renderPostDetail(post);
  } catch (error) {
    if (requestId !== postDetailRequest || !postDialog.open) return;
    target.innerHTML = `<div class="post-detail-state"><p>We couldn't load this post.</p><p>${escapeHTML(error.message)}</p><button class="button button-outline" data-action="retry-post-detail" data-id="${escapeHTML(id)}">Try again</button></div>`;
  }
}

document.addEventListener("click", async (event) => {
  const profileLink = event.target.closest("[data-profile]");
  if (profileLink) {
    event.preventDefault();
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
    } else if (action === "close-dialog") closeDialogs();
    else if (action === "close-post-detail") closePostDialog();
    else if (action === "retry-post-detail") return openPost(control.dataset.id);
    else if (action === "focus-comment") document.querySelector("#post-comment-input")?.focus();
    else if (action === "create") {
      if (!currentUser) return openAuth();
      openDialog("create-dialog");
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
    } else if (action === "post-menu") {
      const choice = prompt("Type edit to change the caption, or delete to remove this post.");
      if (choice?.toLowerCase() === "delete" && confirm("Delete this post? This cannot be undone.")) {
        await api(`/posts/${card.dataset.postId}`, { method: "DELETE" });
        if (postDialog.open) closePostDialog();
        notify("Post deleted.");
        return openPage(currentPage, profileUsername);
      }
      if (choice?.toLowerCase() === "edit") {
        const caption = prompt("Edit your caption:");
        if (caption !== null) {
          await api(`/posts/${card.dataset.postId}`, { method: "PATCH", body: JSON.stringify({ caption }) });
          notify("Caption updated.");
          if (postDialog.open) return openPost(card.dataset.postId);
          return openPage(currentPage, profileUsername);
        }
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
    } else if (action === "connections") {
      const { users } = await api(`/users/${encodeURIComponent(control.dataset.username)}/${control.dataset.kind}`);
      const list = users.length ? users.map((user) => `@${user.username}`).join("\n") : "No one here yet.";
      alert(`${control.dataset.kind === "followers" ? "Followers" : "Following"}\n\n${list}`);
    } else if (action === "delete-comment") {
      if (!confirm("Delete this comment?")) return;
      await api(`/posts/${control.dataset.postId}/comments/${control.dataset.commentId}`, { method: "DELETE" });
      await openPost(control.dataset.postId);
    }
  } catch (error) { notify(error.message); }
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

document.documentElement.dataset.theme = localStorage.getItem(themeKey) || "light";
document.querySelectorAll("[data-theme-label]").forEach((label) => {
  label.textContent = document.documentElement.dataset.theme === "dark" ? "Light mode" : "Dark mode";
});
updateAuthUI();

if (localStorage.getItem(tokenKey)) {
  api("/auth/me")
    .then(({ user }) => { currentUser = user; updateAuthUI(); })
    .catch(() => localStorage.removeItem(tokenKey))
    .finally(() => openPage("feed"));
} else openPage("feed");
