<script lang="ts">
import type { HeadingItem } from '@/lib/utils/heading-id';
import { onMount } from 'svelte';
import { PanelRightDashed } from '@lucide/svelte';

interface Props {
  title: string;
  headings: HeadingItem[];
  siteTitle?: string;
}

const { title, headings, siteTitle }: Props = $props()

let isDesktopOutlineOpen = $state(false);
let isMobileOutlineOpen = $state(false);
let isDesktop = $state(true);

function scrollToHeading(id: string) {
  const element = document.getElementById(id);
  if (element) {
    // Update URL hash without triggering page jump
    if (window.history && window.history.pushState) {
      window.history.pushState(null, '', `#${id}`);
    } else {
      // Fallback for older browsers
      window.location.hash = id;
    }

    // Smooth scroll to element
    element.scrollIntoView({ behavior: 'smooth' });

    // Close mobile outline after navigation
    if (!isDesktop) {
      isMobileOutlineOpen = false;
    }
  }
}

function toggleDesktopOutline() {
  isDesktopOutlineOpen = !isDesktopOutlineOpen;

  // Apply dynamic styling to main content
  const articleMain = document.querySelector('.article-main') as HTMLElement;
  if (articleMain) {
    if (isDesktopOutlineOpen) {
      articleMain.style.marginRight = '200px';
    } else {
      articleMain.style.marginRight = '0';
    }
  }
}

function toggleMobileOutline() {
  isMobileOutlineOpen = !isMobileOutlineOpen;
}

function checkScreenSize() {
  isDesktop = window.innerWidth >= 768; // md breakpoint
}

// Handle initial hash on page load and setup
onMount(() => {
  checkScreenSize();
  window.addEventListener('resize', checkScreenSize);

  const hash = window.location.hash;
  if (hash) {
    const id = hash.substring(1); // Remove the # prefix
    const element = document.getElementById(id);
    if (element) {
      // Small delay to ensure page is fully loaded
      setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }

  return () => {
    window.removeEventListener('resize', checkScreenSize);
  };
});
</script>

{#if headings.length > 0}
  <!-- Desktop Toggle Button (absolute positioned in title area) -->
  {#if isDesktop}
    <button
      class="desktop-outline-toggle"
      onclick={toggleDesktopOutline}
      aria-label="Toggle outline"
    >
      <PanelRightDashed size={20} />
    </button>
  {/if}

  <!-- Desktop Right Panel -->
  {#if isDesktop && isDesktopOutlineOpen}
    <aside class="desktop-outline-panel">
      <div class="outline-header">
        <h3>Outline</h3>
      </div>
      <nav class="outline-content">
        <ul class="outline-list">
          {#each headings as heading}
            <li class="outline-item level-{heading.level}">
              <button
                type="button"
                class="outline-link"
                onclick={() => scrollToHeading(heading.id)}
              >
                {heading.text}
              </button>
            </li>
          {/each}
        </ul>
      </nav>
    </aside>
  {/if}

  <!-- Mobile Floating Panel -->
  {#if !isDesktop && isMobileOutlineOpen}
    <div class="mobile-outline-overlay" onclick={toggleMobileOutline}></div>
    <aside class="mobile-outline-panel">
      <div class="outline-header">
        <h3>Outline</h3>
        <button class="mobile-close-btn" onclick={toggleMobileOutline}>×</button>
      </div>
      <nav class="outline-content">
        <ul class="outline-list">
          {#each headings as heading}
            <li class="outline-item level-{heading.level}">
              <button
                type="button"
                class="outline-link"
                onclick={() => scrollToHeading(heading.id)}
              >
                {heading.text}
              </button>
            </li>
          {/each}
        </ul>
      </nav>
    </aside>
  {/if}
{/if}

<!-- Footer Banner (always visible on mobile when headings exist) -->
{#if !isDesktop && headings.length > 0}
  <footer class="mobile-footer-banner">
    <div class="footer-home-title">
      <a href="/" class="home-title-link">{title}</a>
    </div>
    <button
      class="mobile-outline-toggle"
      onclick={toggleMobileOutline}
      aria-label="Toggle outline"
    >
      <PanelRightDashed size={20} />
    </button>
  </footer>
{/if}

<style lang="scss">
@use '@/styles/theme-utils' as theme;

/* Desktop Toggle Button */
.desktop-outline-toggle {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 10;
  background-color: transparent;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  color: theme.theme-color('text');
  transition: color 0.2s ease;

  &:hover {
    color: theme.theme-color('link');
  }
}

/* Desktop Right Panel */
.desktop-outline-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 200px;
  height: 100vh;
  background-color: theme.theme-color('bg');
  border-left: 1px solid theme.theme-color('code-border');
  z-index: 100;
  overflow-y: auto;
  padding: 1rem;
}

/* Mobile Overlay */
.mobile-outline-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 200;
}

/* Mobile Floating Panel */
.mobile-outline-panel {
  position: fixed;
  bottom: 60px; /* Above footer banner */
  left: 1rem;
  right: 1rem;
  max-height: 50vh;
  background-color: theme.theme-color('bg');
  border: 1px solid theme.theme-color('code-border');
  border-radius: 8px;
  z-index: 201;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

/* Footer Banner */
.mobile-footer-banner {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  background-color: theme.theme-color('surface-0');
  border-top: 1px solid theme.theme-color('code-border');
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  z-index: 100;
}

.footer-home-title {
  flex: 1;
}

.home-title-link {
  color: theme.theme-color('text');
  text-decoration: none;
  font-weight: 600;
  font-size: 1.1rem;

  &:hover {
    color: theme.theme-color('link');
  }
}

.mobile-outline-toggle {
  background-color: transparent;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  color: theme.theme-color('text');

  &:hover {
    color: theme.theme-color('link');
  }
}

/* Outline Header */
.outline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;

  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: theme.theme-color('text');
  }
}

.mobile-close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: theme.theme-color('text');
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: theme.theme-color('link');
  }
}

/* Outline Content */
.outline-content {
  flex: 1;
  overflow-y: auto;
}

.outline-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.outline-item {
  margin: 0;

  &.level-1 { padding-left: 0; }
  &.level-2 { padding-left: 1rem; }
  &.level-3 { padding-left: 2rem; }
  &.level-4 { padding-left: 3rem; }
  &.level-5 { padding-left: 4rem; }
  &.level-6 { padding-left: 5rem; }
}

.outline-link {
  display: block;
  width: 100%;
  text-align: left;
  font-size: 0.85rem;
  background-color: transparent;
  border: none;
  padding: 0.25rem 0;
  line-height: 1.3;
  cursor: pointer;
  color: theme.theme-color('text');
  transition: color 0.2s ease;

  &:hover {
    color: theme.theme-color('link');
  }
}

/* Responsive adjustments */
@media (min-width: 768px) {
  .mobile-footer-banner,
  .mobile-outline-panel,
  .mobile-outline-overlay {
    display: none;
  }
}

@media (max-width: 767px) {
  .desktop-outline-toggle,
  .desktop-outline-panel {
    display: none;
  }

  /* Add bottom padding to main content to avoid footer overlap */
  :global(.article-main) {
    padding-bottom: 80px;
  }
}
</style>
