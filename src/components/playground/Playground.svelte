<script lang="ts">
	import { onMount } from 'svelte';
  import { example as SOURCE_CODE_EXAMPLE } from './const';

	// 默认 Svelte 5 示例代码
	let sourceCode = $state(SOURCE_CODE_EXAMPLE);

	let container: HTMLDivElement;
	let shadowRoot: ShadowRoot | null = null;
	let currentApp: any = null;
	let error = $state<string | null>(null);
	let isCompiling = $state(false);
	
	// Dynamic Svelte runtime
	let mountFn: any = null;
	let unmountFn: any = null;

	onMount(async () => {
		// 页面加载时自动运行一次
		handleRun();
	});

	function cleanup() {
		if (currentApp && unmountFn) {
			try {
				unmountFn(currentApp);
			} catch (e) {
				console.warn('Unmount failed', e);
			}
			currentApp = null;
		}
		if (shadowRoot) {
			shadowRoot.innerHTML = '';
		}
	}

	async function handleRun() {
		if (!container) return;
		isCompiling = true;
		error = null;
		
		// 确保 Shadow DOM 已创建
		if (!shadowRoot) {
			shadowRoot = container.attachShadow({ mode: 'open' });
		}
		
		cleanup();

		try {
			// 0. 加载运行时 (只需要加载一次)
			if (!mountFn || !unmountFn) {
				// @ts-ignore
				const svelte = await import('https://esm.sh/svelte@5.19.2');
				mountFn = svelte.mount;
				unmountFn = svelte.unmount;
			}

			// 1. 服务端编译
			const response = await fetch('/api/playground/compile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: sourceCode })
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Compilation failed on server');
			}

			// 手动替换 Import Map 路径 (保持与 CDN 运行时一致)
			let jsCode = result.js;
			const imports: Record<string, string> = {
				"svelte/internal/client": "https://esm.sh/svelte@5.19.2/internal/client",
				"svelte/internal/disclose-version": "https://esm.sh/svelte@5.19.2/internal/disclose-version",
				"svelte/internal/flags/legacy": "https://esm.sh/svelte@5.19.2/internal/flags/legacy",
				"svelte": "https://esm.sh/svelte@5.19.2",
				"esm-env": "https://esm.sh/esm-env"
			};

			for (const [key, url] of Object.entries(imports)) {
				jsCode = jsCode.replaceAll(`"${key}"`, `"${url}"`);
				jsCode = jsCode.replaceAll(`'${key}'`, `'${url}'`);
			}

			// 2. 创建模块 URL
			const blob = new Blob([jsCode], { type: 'text/javascript' });
			const url = URL.createObjectURL(blob);

			// 3. 动态加载并挂载
			try {
				const module = await import(/* @vite-ignore */ url);
				const Component = module.default;

				if (Component) {
					currentApp = mountFn(Component, {
						target: shadowRoot,
						props: {}
					});
				} else {
					throw new Error('No default export found in compiled module');
				}
			} finally {
				URL.revokeObjectURL(url);
			}

		} catch (e: any) {
			console.error(e);
			error = e.message || e.toString();
		} finally {
			isCompiling = false;
		}
	}
</script>

<div class="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
	<!-- Editor Section -->
	<div class="flex flex-col gap-2 h-full min-h-[300px]">
		<div class="flex justify-between items-center">
			<h2 class="font-bold text-gray-800 dark:text-gray-200">Input (Svelte 5)</h2>
			<button 
				onclick={handleRun}
				disabled={isCompiling}
				class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50 transition-colors"
			>
				{isCompiling ? 'Compiling...' : 'Run Code'}
			</button>
		</div>
		<textarea 
			bind:value={sourceCode}
			class="w-full flex-1 p-3 font-mono text-sm border border-gray-300 rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
			spellcheck="false"
			placeholder="Enter Svelte code here..."
		></textarea>
	</div>

	<!-- Preview Section -->
	<div class="flex flex-col gap-2 h-full min-h-[300px]">
		<h2 class="font-bold text-gray-800 dark:text-gray-200">Preview</h2>
		<div class="flex-1 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 relative overflow-hidden shadow-inner">
			{#if error}
				<div class="absolute inset-0 p-4 text-red-600 bg-red-50 dark:bg-red-900/10 dark:text-red-400 whitespace-pre-wrap font-mono text-sm z-10 overflow-auto">
					<strong>Error:</strong><br/>{error}
				</div>
			{/if}
			<!-- Shadow DOM Host -->
			<div bind:this={container} class="w-full h-full overflow-auto"></div>
		</div>
	</div>
</div>
