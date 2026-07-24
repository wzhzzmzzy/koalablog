export const snapshotFixture = `<script>alert(1)</script><style>.escape { color: red }</style>
<a href="javascript:alert(1)" onclick="alert(1)">Unsafe</a>
<a href="//outside.test">Protocol-relative</a><a href="/safe">Safe</a><img src="/koala.png" onerror="alert(1)">
<form action="//outside.test" onsubmit="alert(1)"><input name="q" value="koala"><button formaction="https://example.test/find">Find</button></form>
<iframe src="https://example.test"></iframe><base href="https://example.test">`

export const canonicalSnapshotFixture = '\n<a>Unsafe</a>\n<a>Protocol-relative</a><a href="/safe">Safe</a><img src="/koala.png">\n<form><input name="q" value="koala"><button formaction="https://example.test/find">Find</button></form>\n'
