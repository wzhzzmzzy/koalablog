export const example = `<script>
	let count = $state(0);
	let name = $state('World');

	function increment() {
		count += 1;
	}
<\/script>

<div class="card">
	<h2>Hello, {name}!</h2>
	
	<p>Count is: <strong>{count}</strong></p>
	
	<div class="controls">
		<button onclick={increment}>
			Increment
		</button>
		
		<input bind:value={name} placeholder="Type a name..." />
	</div>
</div>

<style>
	.card {
		padding: 1.5rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		background: white;
		box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
		font-family: system-ui, sans-serif;
	}
	
	h2 {
		margin-top: 0;
		color: #111827;
	}

	.controls {
		display: flex;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	button {
		background: #2563eb;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 0.25rem;
		cursor: pointer;
	}
	
	button:hover {
		background: #1d4ed8;
	}

	input {
		padding: 0.5rem;
		border: 1px solid #d1d5db;
		border-radius: 0.25rem;
	}
</style>`
