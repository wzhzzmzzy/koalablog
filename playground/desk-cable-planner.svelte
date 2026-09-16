<script>
  import { onMount } from 'svelte'
  import { ActionError, isOwnerAccessError, readMarkdown, saveOwnedMarkdown } from '@koala/page-runtime'

  // Public reads are anonymous; only the companion File's Owner may save.
  const STATE_PATH = '/data/desk-cable-planner-state'
  const STATE_PREFIX = STATE_PATH.slice(0, STATE_PATH.lastIndexOf('/')) || '/'
  let root
  let planner
  let baseline
  let pending = null
  let saving = false
  let disposed = false
  let timer
  let initialized = false
  let canEdit = false
  let busy = true
  let failed = false
  let message = '正在载入公开布线方案…'
  let savedSettings = ''

  // The editable subset is nine ordinary Markdown list entries. Everything else
  // (headings, comments, links, notes, blank lines) is retained byte-for-byte.
  const fields = [
    { key: 'height', label: '当前桌高', unit: 'cm', min: 75, max: 150 },
    { key: 'maxHeight', label: '最高桌高', unit: 'cm', min: 90, max: 150 },
    { key: 'hubMode', label: 'Hub 安装', choices: ['随桌升降', '固定离地 65 cm'] },
    { key: 'shelfGap', label: '层板墙后缝', unit: 'mm', min: 6, max: 10 },
    { key: 'wallGhost', label: '透视墙面', checkbox: true },
    { key: 'dimensionOn', label: '显示尺寸', checkbox: true },
    { key: 'ghost', label: '透视设备', checkbox: true },
    { key: 'labels', label: '设备标签', checkbox: true },
    { key: 'isolate', label: '仅显示选中线材', checkbox: true },
  ]
  function fieldPattern(field) {
    return field.checkbox
      ? new RegExp('^- \\[([ xX])\\] ' + field.label + '[ \\t]*$')
      : new RegExp('^- ' + field.label + '：[ \\t]*(.*?)[ \\t]*$')
  }
  function parseMarkdown(content) {
    const lines = content.split(/\r?\n/)
    const result = {}
    for (const field of fields) {
      const matches = lines.map(line => fieldPattern(field).exec(line)).filter(Boolean)
      if (matches.length !== 1) throw new Error('状态文件需包含且仅包含一个「' + field.label + '」条目。')
      const value = matches[0][1]
      if (field.checkbox) result[field.key] = value.toLowerCase() === 'x'
      else if (field.choices) {
        if (!field.choices.includes(value)) throw new Error('请核对状态文件中的 Hub 安装方式。')
        result[field.key] = value === field.choices[0] ? 'moving' : 'fixed'
      } else {
        const match = new RegExp('^(\\d+)\\s*' + field.unit + '$').exec(value)
        const number = match ? Number(match[1]) : NaN
        if (!Number.isInteger(number) || number < field.min || number > field.max)
          throw new Error('「' + field.label + '」须为 ' + field.min + '–' + field.max + ' ' + field.unit + '。')
        result[field.key] = number
      }
    }
    if (result.height > result.maxHeight) throw new Error('当前桌高不能超过最高桌高。')
    return result
  }
  function serializeMarkdown(content, settings) {
    parseMarkdown(content)
    // Split with retained newline delimiters, so even CRLF and unrelated prose survive.
    return content.split(/(\r?\n)/).map(line => {
      const field = fields.find(field => fieldPattern(field).test(line))
      if (!field) return line
      const value = settings[field.key]
      if (field.checkbox) return '- [' + (value ? 'x' : ' ') + '] ' + field.label
      return '- ' + field.label + '：' + (field.choices
        ? field.choices[value === 'moving' ? 0 : 1]
        : value + ' ' + field.unit)
    }).join('')
  }
  function errorMessage(error) {
    if (isOwnerAccessError(error)) return '请以状态文件所有者身份登录后保存。'
    if (error?.name === 'CompanionFileError') return '找不到可用状态文件。请确认 ' + STATE_PATH + ' 是未删除的公开 Markdown。'
    if (error instanceof ActionError) return '保存服务暂不可用；本次调整尚未保存，可点击重试保存。'
    return error instanceof Error && /状态文件|当前桌高|须为/.test(error.message)
      ? error.message : '无法载入方案。请检查连接、状态文件或浏览器的 WebGL 支持后重试。'
  }
  async function loadState(conflict = false) {
    busy = true
    failed = false
    pending = null
    clearTimeout(timer)
    try {
      const file = await readMarkdown({ path: STATE_PATH, prefix: STATE_PREFIX, scope: 'public' })
      const settings = parseMarkdown(file.content)
      if (disposed) return
      if (!planner) {
        const [THREE, { OrbitControls }] = await Promise.all([
          import('https://esm.sh/three@0.160.0'),
          import('https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js'),
        ])
        if (disposed) return
        planner = createPlanner(root, THREE, OrbitControls)
      }
      planner.applySettings(settings)
      baseline = file
      canEdit = file.canEdit === true
      savedSettings = JSON.stringify(planner.readSettings())
      initialized = true
      message = conflict ? '发现版本冲突，已载入最新方案；刚才未保存的调整已撤回，请重新调整。'
        : canEdit ? '已载入 · 调整会自动保存' : '公开方案 · 调整仅在当前页面生效'
    } catch (error) {
      failed = true
      message = errorMessage(error)
    } finally {
      if (!disposed) busy = false
    }
  }
  function requestSave() {
    if (busy || disposed || !planner || !baseline) return
    const settings = planner.readSettings()
    if (!canEdit) {
      message = JSON.stringify(settings) === savedSettings
        ? '公开方案 · 调整仅在当前页面生效' : '访客预览 · 调整仅在当前页面生效，刷新后恢复公开方案'
      return
    }
    if (!saving && JSON.stringify(settings) === savedSettings) {
      pending = null; clearTimeout(timer); failed = false; message = '已保存'; return
    }
    pending = settings
    message = '有未保存的调整…'
    clearTimeout(timer)
    if (!failed) timer = setTimeout(flush, 350)
  }
  async function flush() {
    clearTimeout(timer)
    if (saving || busy || disposed || !pending || !canEdit) return
    saving = true
    failed = false
    try {
      while (pending && !disposed) {
        const settings = pending
        pending = null
        message = '正在保存…'
        try {
          const saved = await saveOwnedMarkdown(baseline, serializeMarkdown(baseline.content, settings))
          if (disposed) return
          baseline = saved
          savedSettings = JSON.stringify(settings)
        } catch (error) {
          if (disposed) return
          if (error instanceof ActionError && ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'].includes(error.code)) {
            canEdit = false
            pending = null
            failed = false
            message = '保存权限或文件状态已变化；当前调整仅在本页生效，重新登录并刷新后可再确认保存权限。'
            return
          }
          if (error instanceof ActionError && error.code === 'CONFLICT') {
            await loadState(true)
            return
          }
          pending ??= settings
          throw error
        }
      }
      message = '已保存'
    } catch (error) {
      failed = true
      message = errorMessage(error)
    } finally {
      saving = false
    }
  }
  function retry() {
    if (pending) void flush()
    else void loadState()
  }
  onMount(() => {
    // Opaque Artifact Snapshots must stay neutral and make no authenticated reads.
    if (window.location.origin === 'null') return
    const abort = new AbortController()
    const changed = () => queueMicrotask(requestSave)
    for (const event of ['input', 'change', 'click', 'pointerup', 'keydown'])
      root.addEventListener(event, changed, { signal: abort.signal })
    window.addEventListener('beforeunload', event => {
      if (pending || saving) { event.preventDefault(); event.returnValue = '' }
    }, { signal: abort.signal })
    void loadState()
    return () => {
      disposed = true
      clearTimeout(timer)
      abort.abort()
      planner?.dispose()
    }
  })

  // The original scene, cable paths, measurements, inventory and CSV export are
  // preserved below. DOM queries and all resources belong to this instance.
  const SHELL = "<header><div class=\"brand\"><div class=\"mark\">⌑</div><div><div class=\"eyebrow\">DESK / CONNECTION ATLAS</div><h1>书桌与线材 · 空间规划</h1></div></div><div class=\"header-meta\"><span><i class=\"status-dot\"></i>1:1 尺度建模</span><span>L 形空间 · 双主机工作台</span><button id=\"export-top\">导出线材清单 ↓</button></div></header>\n<div class=\"workspace\">\n<main id=\"viewport\"><canvas id=\"scene\" aria-label=\"可旋转缩放的升降桌、层板、设备和线材三维模型\"></canvas><div class=\"topbar\"><div class=\"scene-title\"><div class=\"eyebrow\">YOUR WORKSPACE, CONNECTED</div><h2>每一条线，都有去处。</h2><p>120 × 80 cm 升降桌<br>两面白墙，木色层板与桌面。</p></div><div class=\"view-tools\"><button id=\"reset\">↺ Reset</button><button id=\"floor-view\">地板视角</button><button id=\"rear-view\">背面接口</button><button id=\"wall-btn\" class=\"active\" aria-pressed=\"true\">透视墙面</button><button id=\"dim-btn\" aria-pressed=\"false\">尺寸</button></div></div><div id=\"scene-badge\" class=\"float-badge\">桌高 75 cm · 最高 130 cm</div><div class=\"scale-note\">单位：米 · 家具按已知尺寸 / 设备按常见尺寸估算</div><div class=\"compass\"><strong>⌖</strong> A 墙 ← 直角 → B 墙</div><div class=\"scene-bottom\"><div class=\"legend\"><span><i style=\"background:#e7bb24\"></i>电源</span><span><i style=\"background:#358adc\"></i>USB 数据</span><span><i style=\"background:#1e2428\"></i>视频</span><span><i style=\"background:#399d79\"></i>网线</span><span><i style=\"background:#c67f49\"></i>音频</span><span><i style=\"background:#8874b9\"></i>控制</span><span><i class=\"dash\"></i>2.4 GHz</span></div><div class=\"hint\">拖拽旋转 · 滚轮缩放 · 右键平移<br>悬停识别 · 点击线材 Focus · Esc 退出</div></div><div id=\"error\" hidden class=\"error\"></div></main>\n<aside>\n<section><div class=\"section-head\"><h2>升降与余量</h2><span class=\"subtle\">实时路径计算</span></div><div class=\"height-row\"><div class=\"height-value\"><output id=\"height-out\">75</output><small>cm</small></div><div class=\"height-actions\"><button id=\"sit\" class=\"active\">75 坐姿</button><button id=\"stand\">130 站姿</button></div></div><label aria-label=\"当前桌面高度\"><input id=\"height\" type=\"range\" min=\"75\" max=\"130\" value=\"75\" step=\"1\"></label><div class=\"range-labels\"><span>75 cm</span><span id=\"max-label\">130 cm</span></div><div class=\"setting-row\"><label for=\"max-height\">最高桌高</label><div><input id=\"max-height\" type=\"number\" min=\"90\" max=\"150\" value=\"130\"> cm</div></div><div class=\"setting-row\"><label for=\"hub-mode\">桌腿 Hub 安装</label><select id=\"hub-mode\"><option value=\"moving\">随桌升降（桌下 10 cm）</option><option value=\"fixed\">固定离地 65 cm</option></select></div><div class=\"setting-row\"><label for=\"shelf-gap\">层板与 B 墙缝隙（假设）</label><div><input id=\"shelf-gap\" type=\"number\" min=\"6\" max=\"10\" step=\"1\" value=\"8\"> mm</div></div><div class=\"quick-toggle\"><label><input id=\"ghost\" type=\"checkbox\">透视设备</label><label><input id=\"labels\" type=\"checkbox\">设备标签</label><label><input id=\"isolate\" type=\"checkbox\">仅显示选中线材</label></div></section>\n<section id=\"detail\" aria-live=\"polite\"></section>\n<div class=\"tabs\"><button class=\"active\" id=\"tab-cables\">线材 <span id=\"cable-count\"></span></button><button id=\"tab-devices\">设备 <span id=\"device-count\"></span></button></div>\n<div id=\"zone-controls\" class=\"zone-controls\" role=\"group\" aria-label=\"按连接位置筛选线材\"></div><div class=\"list-controls\"><input id=\"search\" placeholder=\"查找设备、线材或接口…\" aria-label=\"搜索设备和线材\"><select id=\"filter\" aria-label=\"线材类型\"><option value=\"all\">全部类型</option><option value=\"power\">电源</option><option value=\"usb\">USB</option><option value=\"video\">视频</option><option value=\"ethernet\">网线</option><option value=\"audio\">音频</option><option value=\"control\">控制</option><option value=\"wireless\">无线</option></select></div><div id=\"inventory\" class=\"inventory\"></div>\n<div class=\"footer-note\"><details id=\"assumptions\"><summary>尺寸假设与待确认连接</summary><ul><li>展示升降范围为默认桌位 75 cm 至设定最高桌位；未推断实际最低桌高。墙宽均为 200 cm，墙高暂按 220 cm；桌背距 A 墙 2 cm。桌板及层板厚度暂按 2.5 cm；高度均取顶面。</li><li>层板沿 B 墙延伸 80 cm；上层深 34 cm、下层深 40 cm。层板离 B 墙暂留 8 mm，板深保持不变；计入墙后缝后，下层前沿伸入桌下 5.8 cm，上层前沿与桌边余缝 2 mm。页面允许在 6–10 mm 内调整墙后缝，需按实物核对安装公差。</li><li>PC 使用 30 × 32 × 25 cm 紧凑机箱估算，非标准中塔；Mac Mini 使用 19.7 × 3.6 × 19.7 cm 机型。设备详情列出全部假设尺寸。</li><li>路由器、DAS 的外部供电，左右音响的供电及信号连接未提供，暂不添加。Mac Mini 叠在 DAS 上；实际摆放需核对机型散热口。</li><li>显示器 USB-C 数据上行已通过 C to C 线连接桌腿扩展 Hub 的 USB-C 下行口；键盘经显示器 USB-A 和这条上行链路接入当前选中的主机。DP / HDMI 承担独立视频连接。</li><li>桌下插排进线暂按接 A 墙双位插座估算；PC 占另一插位。供电插头和适配器规格须按实物核对。</li><li>USB 充电 Hub → Trackpad 为充电路径；USB 扩展 Hub 按双主机切换器建模，需核对设备是否支持双上行切换。</li><li>协议版本、传输速率和显示分辨率未提供。DP/HDMI/USB/RJ45 仅表示连接类别，建议长度不等于链路性能保证。</li><li>Mac 电源穿层板与 B 墙的后缝；HDMI 与 Mac USB 上行线走 PC 与 Mac/DAS 之间的通道。麦克风、控制器和扩展 Hub 电源线先沿桌面或桌底走向 A 墙后沿，再沿后沿下降，最后到右桌腿 Hub。</li><li>路径取连续弯曲及悬垂曲线的中心长度；窄处按家具间隙收紧弯曲，只有固定设备与升降部件之间的自由段示意轻微悬垂；沿墙、沿后沿的线不添加装饰性波浪。曲线并非线材刚度或受力仿真，额外采购余量没有强行盘在线上；最高桌位与整个升降范围均会计算。建议余量 = 路径需求的 15% 与 20 cm 中的较大值，再向上取常见线长。弯折半径、插头外壳、绕线方式须现场复核。</li></ul></details><button class=\"export-button\" id=\"export-bottom\">导出当前规划清单 ↓</button></div>\n</aside></div><div id=\"tooltip\" class=\"tooltip\"></div>"
  function createPlanner(root, THREE, OrbitControls) {
    const lifecycle = new AbortController()
    let frameId = 0
    let stopped = false

const plannerEl=id=>root.querySelector('[id="'+id+'"]');
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const COLORS={power:0xe7b51c,usb:0x287bd2,video:0x171e24,ethernet:0x2e9672,audio:0xbb743d,control:0x8a72b8,wireless:0xa96dad};
const TYPES={power:'电源',usb:'USB 数据',video:'视频',ethernet:'以太网',audio:'模拟音频',control:'远程控制',wireless:'无线'};
let shelfGap=.008;
let height=.75,maxHeight=1.3,hubMode='moving',selected=null,tab='cables',wallGhost=true,dimensionOn=false;
const devices={},ports={},cables=[],deviceMeshes=[],cableMeshes=[],baseMaterials=[],deviceLabels=[];
const scene=new THREE.Scene();scene.background=new THREE.Color(0xe9eee6);
const camera=new THREE.PerspectiveCamera(39,1,.01,50);
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas:plannerEl('scene'),antialias:true,alpha:false,preserveDrawingBuffer:true});}catch(e){throw new Error('WebGL initialization failed');}
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.085;controls.minDistance=.3;controls.maxDistance=7;controls.minPolarAngle=.03;controls.maxPolarAngle=Math.PI-.03;controls.target.set(-.75,.64,.36);controls.enablePan=true;
scene.add(new THREE.HemisphereLight(0xffffff,0x919b87,2.3));const sun=new THREE.DirectionalLight(0xfff4de,3.1);sun.position.set(-2.8,4.8,3.5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-3;sun.shadow.camera.right=3;sun.shadow.camera.top=3;sun.shadow.camera.bottom=-3;sun.shadow.normalBias=.014;sun.shadow.bias=-.00015;scene.add(sun);const fill=new THREE.DirectionalLight(0xe0edf4,1.15);fill.position.set(1,2,-2);scene.add(fill);
const stationary=new THREE.Group(),moving=new THREE.Group(),hubRoot=new THREE.Group(),wireRoot=new THREE.Group(),dims=new THREE.Group();scene.add(stationary,moving,hubRoot,wireRoot,dims);dims.visible=false;
const material=(color,roughness=.65,metalness=0)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness});baseMaterials.push(m);return m;};
function woodTex(){const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#c8a37b';ctx.fillRect(0,0,512,256);let seed=9193;function rnd(){seed=(seed*16807)%2147483647;return(seed-1)/2147483646;}for(let i=0;i<600;i++){let y=rnd()*256;ctx.strokeStyle=`rgba(${rnd()>.4?'106,69,32':'247,220,175'},${.025+rnd()*.13})`;ctx.lineWidth=.35+rnd();ctx.beginPath();ctx.moveTo(0,y);for(let x=0;x<=512;x+=16)ctx.lineTo(x,y+Math.sin(x*.018+i)*(.4+rnd()*2));ctx.stroke();}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1.8,1.2);return t;}
const wood=material(0xffffff,.6);wood.map=woodTex();const dark=material(0x262b2c,.55),black=material(0x11191b,.5),metal=material(0xb5bebd,.4,.5),white=material(0xedeee7,.55),warmWhite=material(0xd8dfd4,.7),rubber=material(0x1c2426,.9),silver=material(0xc8cecf,.38,.7),led=material(0x6acda6,.25);led.emissive.setHex(0x2d7e63);led.emissiveIntensity=.5;
function box(parent,w,h,d,x,y,z,mat=dark){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function cyl(parent,r,h,x,y,z,mat=dark,axis='y',rt=r){const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,r,h,32),mat);if(axis==='z')m.rotation.x=Math.PI/2;if(axis==='x')m.rotation.z=Math.PI/2;m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function sphere(parent,r,x,y,z,mat=dark){const m=new THREE.Mesh(new THREE.SphereGeometry(r,20,12),mat);m.position.set(x,y,z);parent.add(m);return m;}
function bar(parent,a,b,r,mat=dark){const av=V(...a),bv=V(...b),m=cyl(parent,r,av.distanceTo(bv),...av.clone().add(bv).multiplyScalar(.5).toArray(),mat);m.quaternion.setFromUnitVectors(V(0,1,0),bv.sub(av).normalize());return m;}
function rounded(parent,w,h,d,x,y,z,mat,r=.015){r=Math.min(r,w/3,d/3);const shape=new THREE.Shape();shape.moveTo(-w/2+r,-d/2);shape.lineTo(w/2-r,-d/2);shape.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r);shape.lineTo(w/2,d/2-r);shape.quadraticCurveTo(w/2,d/2,w/2-r,d/2);shape.lineTo(-w/2+r,d/2);shape.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r);shape.lineTo(-w/2,-d/2+r);shape.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2);const g=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.0015,bevelThickness:.0015,curveSegments:6});g.rotateX(Math.PI/2);g.translate(0,h/2,0);const m=new THREE.Mesh(g,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function textPlane(parent,text,w,h,x,y,z,bg='#233934',fg='#c1e7d2'){const c=document.createElement('canvas');c.width=512;c.height=Math.max(64,Math.round(512*h/w));const c2=c.getContext('2d');c2.fillStyle=bg;c2.fillRect(0,0,c.width,c.height);c2.font=`500 ${c.height*.60}px -apple-system, sans-serif`;c2.textAlign='center';c2.textBaseline='middle';c2.fillStyle=fg;c2.fillText(text,c.width/2,c.height/2);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const mat=new THREE.MeshBasicMaterial({map:t});baseMaterials.push(mat);const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);m.position.set(x,y,z);parent.add(m);return m;}
function sprite(text,w=.22){const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#fafbf7ed';ctx.fillRect(0,0,512,96);ctx.strokeStyle='#bbcbb6';ctx.lineWidth=3;ctx.strokeRect(1,1,510,94);ctx.fillStyle='#3c5540';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='500 34px sans-serif';ctx.fillText(text,256,49);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false}));s.scale.set(w,w*96/512,1);s.renderOrder=20;return s;}
function addDevice(id,name,size,pos,mobility,description){const g=new THREE.Group();g.position.set(...pos);(mobility==='desk'?moving:mobility==='hub'?hubRoot:stationary).add(g);devices[id]={id,name,size,pos,mobility,description,group:g,ports:[]};return g;}
function port(id,device,local,kind,normal='z'){const dev=devices[device];const p={id,device,kind,pos:[dev.pos[0]+local[0],dev.pos[1]+local[1],dev.pos[2]+local[2]],mobility:dev.mobility};ports[id]=p;dev.ports.push(p);const g=dev.group;const [x,y,z]=local;const isRound=/3.5|C7|DC|Lightning/.test(kind);let m;if(isRound)m=cyl(g,.004,.003,x,y,z,black,normal);else{let w=/RJ45/.test(kind)?.013:/HDMI|DP/.test(kind)?.013:/USB-A/.test(kind)?.012:.008;let h=/RJ45/.test(kind)?.01:.004;m=box(g,normal==='x'?.003:w,h,normal==='x'?w:.003,x,y,z,black);}
if(/USB-A/.test(kind)){box(g,normal==='x'?.003:.009,.0015,normal==='x'?.009:.003,x+(normal==='x'?-.0018:0),y,z+(normal==='z'?.0018:0),material(0x2c76a5));}m.userData.port=id;return p;}
// Room coordinate system: A is z=0, B is x=0, the desk occupies x=-1.55..-.35.
const floor=box(stationary,2.35,.025,2.28,-1.06,-.019,1.02,material(0xd6ddcf,.94));floor.receiveShadow=true;
const wallMat=new THREE.MeshStandardMaterial({color:0xf8f9f3,roughness:.94,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide});
const wallA=box(stationary,2,2.2,.025,-1,1.1,-.014,wallMat),wallB=box(stationary,.025,2.2,2,.014,1.1,1,wallMat);wallA.castShadow=wallB.castShadow=false;
const grid=new THREE.GridHelper(2,20,0xb4c3ad,0xc5cfbd);grid.position.set(-1,-.003,1);grid.material.transparent=true;grid.material.opacity=.3;scene.add(grid);
bar(stationary,[-2,.004,0],[0,.004,0],.002,warmWhite);bar(stationary,[0,.004,0],[0,.004,2],.002,warmWhite);
const aLabel=sprite('A 墙 · 200 cm',.34);aLabel.position.set(-1.28,1.67,.005);stationary.add(aLabel);const bLabel=sprite('B 墙 · 200 cm',.34);bLabel.position.set(.01,1.47,.94);stationary.add(bLabel);
const desk=addDevice('desk','原木升降桌',[1.2,.75,.8],[-.95,0,.42],'desk','已知：桌面 120 × 80 cm；初始顶面 75 cm，最高 130 cm。右边缘至 B 墙 35 cm。桌板厚 2.5 cm，后沿距 A 墙 2 cm 为估算。T 型落地横梁垂直 A 墙。');
box(desk,1.2,.025,.8,0,.7375,0,wood);box(desk,.99,.055,.065,0,.6775,0,dark);
// Telescopic columns: feet and outer sleeves are fixed; top sleeves follow the desk.
const legs=[];for(const x of[-1.43,-.47]){box(stationary,.075,.035,.66,x,.027,.42,dark);for(const z of[.115,.725])box(stationary,.08,.012,.065,x,.007,z,rubber);box(stationary,.065,.40,.07,x,.24,.42,dark);const sleeve=box(stationary,.05,.31,.055,x,.525,.42,metal);legs.push(sleeve);box(moving,.08,.035,.45,x,.71,.42,dark);}
textPlane(desk,'↑  75  ↓',.06,.018,.42,.706,.4,'#1e2925','#d5e6d4');
const upper=addDevice('upper','上层原木层板',[.34,.025,.8],[-.17-shelfGap,.7875,.42],'fixed','已知：顶面距地 80 cm，沿 B 墙宽 80 cm，向外深 34 cm；厚 2.5 cm 为假设，暂不放设备。');box(upper,.34,.025,.8,0,0,0,wood);
const lower=addDevice('lower','下层原木层板',[.4,.025,.8],[-.2-shelfGap,.3875,.42],'fixed','已知：顶面距地 40 cm，沿 B 墙宽 80 cm，向外深 40 cm。向桌下多伸入 5 cm。厚度暂按 2.5 cm。');box(lower,.4,.025,.8,0,0,0,wood);
for(const z of[.14,.7])for(const h of[.4,.8]){box(stationary,.018,.16,.022,-.018,h-.095,z,warmWhite);bar(stationary,[-.018,h-.16,z],[-.28,h-.027,z],.006,warmWhite);}
const pc=addDevice('pc','Windows PC',[.30,.32,.25],[-.198,.564,.1625],'fixed','估算紧凑机箱 30 × 32 × 25 cm（X 宽 × 高 × Z 深），底部留 4 mm 脚垫。位于 A/B 墙角。I/O 面位于朝桌子的外侧 x=-.348，与 B 墙平行。');
box(pc,.30,.32,.25,0,0,0,dark);box(pc,.002,.295,.225,-.151,0,0,material(0x42494a,.6));box(pc,.004,.24,.165,.151,0,0,black);
for(let i=0;i<14;i++)box(pc,.001,.0015,.1,-.153,-.01+i*.009,.034,rubber);
cyl(pc,.044,.004,-.156,.093,.048,black,'x');for(let a=0;a<8;a++){const fan=box(pc,.006,.067,.006,-.160,.093,.048,metal);fan.rotation.x=a*Math.PI/4;}cyl(pc,.012,.006,-.161,.093,.048,dark,'x');
for(let i=0;i<4;i++)box(pc,.003,.008,.14,-.154,-.057-i*.017,.025,black);
box(pc,.003,.103,.059,-.154,.075,-.069,black);cyl(pc,.004,.003,.152,.115,.075,led,'x');
port('pc.dp','pc',[-.158,-.05,-.037],'DisplayPort','x');port('pc.usb','pc',[-.158,.083,-.055],'USB-C','x');port('pc.lan','pc',[-.158,.037,-.071],'RJ45','x');port('pc.ac','pc',[-.158,-.128,-.065],'IEC C14','x');
const das=addDevice('das','四盘位 DAS',[.22,.19,.23],[-.215,.499,.455],'fixed','估算 22 × 19 × 23 cm；四个独立抽取式盘位朝向桌子。Mac Mini 放在正上方。独立电源连接未指定。');box(das,.22,.19,.23,0,0,0,metal);
for(let i=0;i<4;i++){const z=-.083+i*.055;box(das,.005,.165,.05,-.112,0,z,dark);box(das,.007,.035,.039,-.117,-.05,z,black);cyl(das,.002,.003,-.121,.061,z,led,'x');}for(let i=0;i<9;i++)box(das,.003,.1,.003,.111,0,-.086+i*.02,black);port('das.usb','das',[.114,-.055,.051],'USB-C','x');
const mac=addDevice('mac','Mac Mini',[.197,.036,.197],[-.215,.616,.455],'fixed','估算 19.7 × 3.6 × 19.7 cm（经典尺寸机型，非 2024 小机身）。位于 DAS 正上方，背面朝 B 墙，电源与数据接口在背面。');rounded(mac,.197,.036,.197,0,0,0,silver,.025);cyl(mac,.065,.004,0,-.02,0,rubber);box(mac,.002,.025,.162,.1,0,0,black);cyl(mac,.003,.003,-.1,-.006,.075,led,'x');const apple=cyl(mac,.012,.001,0,.02,0,material(0x939d9d,.3,.7));apple.scale.z=.8;
port('mac.hdmi','mac',[.102,0,-.043],'HDMI','x');port('mac.lan','mac',[.102,0,-.017],'RJ45','x');port('mac.host','mac',[.102,0,.013],'USB-C','x');port('mac.das','mac',[.102,0,.039],'USB-C','x');port('mac.ac','mac',[.102,0,.069],'IEC C7','x');
const router=addDevice('router','路由器',[.17,.045,.19],[-.13,.429,.717],'fixed','估算主体 17 × 4.5 × 19 cm，天线额外高 12 cm。位于层板远离 A 墙的一端；背面朝 B 墙，所有 RJ45 端口均朝 x 正向。外部电源连接未指定。');rounded(router,.17,.045,.19,0,0,0,white,.012);box(router,.002,.029,.16,.086,0,0,dark);
for(const z of[-.077,.077]){bar(router,[.059,.02,z],[.06,.14,z],.0045,white);cyl(router,.008,.013,.059,.02,z,dark);}for(let i=0;i<10;i++)box(router,.003,.001,.11,-.055+i*.009,.024,0,material(0xaab5ab));for(let i=0;i<4;i++)cyl(router,.0016,.002,-.086,-.006,-.04+i*.026,led,'x');
port('router.wan','router',[.089,0,-.055],'RJ45 WAN','x');port('router.pc','router',[.089,0,-.025],'RJ45 LAN 1','x');port('router.mac','router',[.089,0,.005],'RJ45 LAN 2','x');port('router.lan3','router',[.089,0,.035],'RJ45 LAN 3（空）','x');port('router.lan4','router',[.089,0,.065],'RJ45 LAN 4（空）','x');
const mon=addDevice('monitor','27 英寸显示器',[.615,.365,.044],[-.95,1.0825,.204],'desk','27 英寸 16:9 面板按约 59.8 × 33.6 cm 建模，含边框外形约 61.5 × 36.5 × 4.4 cm。屏幕外框底边离桌面 15 cm。接口均在背面；USB-C 数据上行连接桌腿 USB 扩展 Hub，供显示器内置 USB-A Hub 与当前选中的主机通信。');
// Monitor body uses an upright box; the screen carries a subtle desktop wallpaper.
box(mon,.615,.365,.044,0,0,0,dark);
const sc=document.createElement('canvas');sc.width=1024;sc.height=576;const sx=sc.getContext('2d');const sg=sx.createLinearGradient(0,0,1024,576);sg.addColorStop(0,'#203b43');sg.addColorStop(.45,'#528778');sg.addColorStop(1,'#c4ccb0');sx.fillStyle=sg;sx.fillRect(0,0,1024,576);for(let i=0;i<5;i++){sx.beginPath();sx.moveTo(-30,470+i*32);sx.bezierCurveTo(230,80+i*52,630,480+i*16,1080,170+i*77);sx.lineTo(1080,620);sx.lineTo(-30,620);sx.fillStyle=['#547c6e','#6e9180','#91ac94','#b4c4a7','#d6dcc2'][i];sx.fill();}sx.fillStyle='#eef6e550';sx.fillRect(0,0,1024,25);sx.fillStyle='#f4f8ef';sx.font='15px sans-serif';sx.fillText('Workspace',25,18);sx.font='12px sans-serif';sx.fillText('Tue  09:41',926,18);sx.fillStyle='#e5eadc75';sx.beginPath();sx.roundRect(300,532,424,34,11);sx.fill();for(let i=0;i<10;i++){sx.fillStyle=['#5585a1','#acc8be','#dca778','#ecdbb8','#657c87'][i%5];sx.beginPath();sx.roundRect(313+i*41,536,25,25,5);sx.fill();}const st=new THREE.CanvasTexture(sc);st.colorSpace=THREE.SRGBColorSpace;const screenMat=new THREE.MeshBasicMaterial({map:st});baseMaterials.push(screenMat);box(mon,.598,.337,.001,0,.004,.0225,screenMat);cyl(mon,.0018,.002,.285,-.174,.023,led,'z');box(mon,.105,.09,.035,0,-.005,-.035,dark);
port('monitor.dp','monitor',[-.21,-.12,-.024],'DisplayPort');port('monitor.hdmi','monitor',[-.177,-.12,-.024],'HDMI');port('monitor.ac','monitor',[.20,-.12,-.024],'IEC C14');port('monitor.usba','monitor',[.13,-.12,-.024],'USB-A');port('monitor.audio','monitor',[.165,-.12,-.024],'3.5 mm TRS');port('monitor.upstream','monitor',[.09,-.12,-.024],'USB-C 数据上行');
const arm=addDevice('arm','桌夹式显示器支架臂',[.29,.35,.18],[-.95,.75,.06],'desk','估算金属关节支架；夹紧桌面后沿，VESA 连接显示器背面。');box(arm,.09,.018,.083,0,-.008,0,dark);box(arm,.06,.07,.014,0,-.04,-.047,dark);box(arm,.065,.012,.06,0,-.074,-.014,dark);cyl(arm,.016,.038,0,-.065,-.011,metal);bar(arm,[0,0,0],[0,.19,0],.021,dark);bar(arm,[0,.17,0],[.13,.26,.025],.024,metal);bar(arm,[.13,.26,.025],[0,.327,.103],.022,dark);for(const p of[[0,.17,0],[.13,.26,.025],[0,.327,.103]])cyl(arm,.026,.04,...p,dark,'z');
function speaker(id,x){const g=addDevice(id,id==='speakerL'?'左音响':'右音响',[.14,.25,.17],[x,.881,.235],'desk','已知高 25 cm、宽 14 cm；箱体深度暂按 17 cm。原木箱体，正面下部圆形中音单元，上部方形号角高音。信号与电源连接未指定。');box(g,.14,.25,.17,0,0,0,wood);box(g,.121,.226,.004,0,0,.087,black);cyl(g,.05,.005,0,-.035,.092,dark,'z');cyl(g,.043,.008,0,-.035,.097,rubber,'z',.029);cyl(g,.019,.007,0,-.035,.102,dark,'z');box(g,.07,.052,.004,0,.075,.092,material(0x3a4240));box(g,.054,.037,.003,0,.075,.096,black);box(g,.027,.019,.004,0,.075,.099,dark);for(const xx of[-.048,.048])for(const yy of[-.10,.1])cyl(g,.002,.002,xx,yy,.092,metal,'z');return g;}
speaker('speakerL',-1.443);speaker('speakerR',-.458);
const charging=addDevice('charging','USB 充电 Hub',[.10,.029,.06],[-1.132,.767,.375],'desk','估算 10 × 2.9 × 6 cm；位于显示器下方靠左。USB-C 口供 Magic Trackpad 充电，外部电源适配器接桌下插排。');rounded(charging,.1,.029,.06,0,0,0,white,.009);port('charging.track','charging',[.015,0,.031],'USB-C');port('charging.ac','charging',[-.028,0,-.032],'DC 输入');for(const x of[-.029,-.007,.025])box(charging,.012,.004,.002,x,0,.031,black);
const clock=addDevice('clock','电子闹钟',[.12,.052,.035],[-.738,.778,.377],'desk','估算 12 × 5.2 × 3.5 cm；显示器下方靠右。供电接口暂按 USB-C，经 USB 电源适配器接桌下插排。');rounded(clock,.12,.052,.035,0,0,0,white,.008);textPlane(clock,'09:41',.104,.036,0,0,.0205,'#344039','#d1e5c7');port('clock.ac','clock',[.035,-.008,-.02],'USB-C 电源');
const keyboard=addDevice('keyboard','键盘',[.325,.018,.12],[-1.15,.763,.665],'desk','估算 32.5 × 1.8 × 12 cm 紧凑键盘。USB-C 连显示器 USB-A；2.4 GHz 接收器插在桌腿扩展 Hub。有线数据经显示器 USB-C 上行线接入桌腿 USB 扩展 Hub，再到选中的 Windows PC 或 Mac Mini。');rounded(keyboard,.325,.018,.12,0,0,0,silver,.01);for(let row=0;row<5;row++)for(let col=0;col<16;col++){if(row===4&&col>3&&col<10)continue;const w=row===4&&col===3?.129:.017;box(keyboard,w,.005,.017,-.151+col*.02+(row===4&&col===3?.056:0),.014,-.049+row*.022,white);}port('keyboard.usb','keyboard',[-.09,0,-.062],'USB-C');
const track=addDevice('track','Magic Trackpad',[.16,.009,.115],[-.824,.758,.665],'desk','估算 16 × 0.9 × 11.5 cm Lightning 机型；Lightning to USB-C 接 USB 充电 Hub 供电。未指定无线配对对象，暂不添加蓝牙连接。');rounded(track,.16,.009,.115,0,0,0,white,.009);port('track.usb','track',[0,0,-.059],'Lightning');
const mouse=addDevice('mouse','无线鼠标',[.063,.038,.105],[-.652,.771,.667],'desk','估算 6.3 × 3.8 × 10.5 cm；通过 2.4 GHz 接收器连接桌腿 USB 扩展 Hub。');const mm=sphere(mouse,1,0,0,0,white);mm.scale.set(.0315,.019,.0525);box(mouse,.001,.003,.034,0,.018,-.018,metal);cyl(mouse,.008,.006,0,.019,-.019,dark,'x');
const mic=addDevice('mic','微型麦克风',[.045,.073,.035],[-.738,.752,.293],'desk','估算支架底座 4.5 × 3.5 cm、总高 7.3 cm，位于电子闹钟背后。USB 线先走向 A 墙后沿，再向下接桌腿 Hub。');rounded(mic,.045,.006,.035,0,.003,0,dark,.012);bar(mic,[0,.006,0],[0,.033,0],.004,dark);const meshMic=cyl(mic,.012,.035,0,.049,0,dark);sphere(mic,.012,0,.066,0,rubber);for(let i=0;i<5;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.0123,.0006,4,24),metal);ring.rotation.x=Math.PI/2;ring.position.set(0,.038+i*.006,0);mic.add(ring);}port('mic.usb','mic',[0,.026,-.013],'USB-C（假设）');
const headset=addDevice('headset','头戴式耳机',[.18,.17,.075],[-1.443,1.012,.235],'desk','估算耳机宽 18 cm、高 17 cm、深 7.5 cm，架在左音响顶部。3.5 mm TRS 连显示器背面音频输出。');const arc=new THREE.Mesh(new THREE.TorusGeometry(.078,.008,12,48,Math.PI),dark);arc.position.set(0,.077,0);headset.add(arc);for(const x of[-.075,.075]){const cup=cyl(headset,.031,.021,x,.026,0,black,'x');cup.scale.y=1.3;cyl(headset,.025,.01,x+(x<0?.016:-.016),.026,0,rubber,'x');bar(headset,[x,.08,0],[x,.033,0],.004,metal);}port('headset.audio','headset',[.075,.008,-.012],'3.5 mm TRS');
const hub=addDevice('hub','USB 扩展 Hub / 双主机切换器',[.036,.04,.14],[-.421,.65,.42],'hub','估算 3.6 × 4 × 14 cm；固定在右桌腿外侧，75 cm 桌位时中心离地 65 cm。默认安装在随桌升降段；可切换为恒定离地 65 cm。两主机 USB-C 上行、一个 USB-C 下行口连接显示器内置 USB Hub、三 USB-A 外设口和专用遥控口。');rounded(hub,.036,.04,.14,0,0,0,dark,.005);for(const z of[-.045,.045])box(hub,.039,.002,.009,0,.021,z,black);port('hub.pc','hub',[-.01,0,-.072],'USB-C 上行 1');port('hub.mac','hub',[.01,0,-.072],'USB-C 上行 2');port('hub.mic','hub',[.02,0,-.039],'USB-A','x');port('hub.monitor','hub',[.02,0,-.058],'USB-C 数据下行（显示器）','x');port('hub.power','hub',[.02,0,.045],'DC 电源','x');port('hub.remote','hub',[.02,0,.019],'专用遥控接口（待确认）','x');port('hub.rxmouse','hub',[.02,0,-.014],'USB-A','x');port('hub.rxkey','hub',[.02,0,.002],'USB-A','x');
const rx1=addDevice('rxmouse','鼠标 2.4 GHz 接收器',[.014,.006,.011],[-.394,.65,.406],'hub','估算迷你 USB-A 接收器，插在桌腿 USB 扩展 Hub。');box(rx1,.014,.006,.011,0,0,0,black);const rx2=addDevice('rxkey','键盘 2.4 GHz 接收器',[.014,.006,.011],[-.394,.65,.422],'hub','估算迷你 USB-A 接收器，插在桌腿 USB 扩展 Hub。');box(rx2,.014,.006,.011,0,0,0,dark);
const remote=addDevice('remote','Hub 远程切换控制器',[.041,.019,.052],[-.549,.761,.278],'desk','估算 4.1 × 1.9 × 5.2 cm；右音响左侧紧贴放置。配套控制线总长 1.5 m，专用插头规格未提供。');rounded(remote,.041,.019,.052,0,0,0,black,.008);cyl(remote,.011,.002,0,.011,0,metal);cyl(remote,.0016,.001,0,.012,-.018,led);port('remote.control','remote',[0,0,-.028],'控制器固定出线');
const strip=addDevice('strip','桌下螺丝固定插排',[.39,.034,.054],[-.945,.689,.092],'desk','估算 39 × 3.4 × 5.4 cm，螺丝固定于桌板底部后侧。五个供电插位，主进线暂按接 A 墙双位插座的另一插位。供电适配器均为占位模型。');box(strip,.39,.034,.054,0,0,0,white);for(let i=0;i<5;i++){const x=-.15+i*.073;box(strip,.053,.012,.042,x,-.022,0,warmWhite);for(const xx of[-.01,.01])box(strip,.003,.001,.01,x+xx,-.029,0,black);}for(const x of[-.183,.183]){cyl(strip,.003,.018,x,.024,0,metal);cyl(strip,.005,.002,x,-.018,0,metal);}port('strip.mains','strip',[-.198,0,0],'插排固定电源线','x');for(const [i,name]of['monitor','charging','hub','clock'].entries())port('strip.'+name,'strip',[-.15+i*.073,-.036,0],'AC 插座 / 适配器');
const outletA=addDevice('outletA','A 墙电源插座',[.15,.086,.016],[-.95,.2,.012],'fixed','已知：A 墙、升降桌正中、离地 20 cm。暂按双插位面板建模：PC 占一位，桌下插排占另一位（后者为补充假设）。');box(outletA,.15,.086,.016,0,0,0,white);for(const x of[-.036,.036]){box(outletA,.055,.055,.002,x,0,.009,warmWhite);box(outletA,.004,.013,.002,x,-.013,.011,black);for(const xx of[-.012,.012]){const s=box(outletA,.003,.013,.002,x+xx,.008,.011,black);s.rotation.z=xx<0?-.4:.4;}}port('wall.pc','outletA',[-.036,0,.019],'AC 墙插');port('wall.strip','outletA',[.036,0,.019],'AC 墙插（假设空位）');
const outletB=addDevice('outletB','B 墙电源插座',[.016,.086,.086],[-.012,.9,.49],'fixed','已知：位于上层层板上方 10 cm，本模型取插座中心离地 90 cm；Mac Mini 接此插座。');box(outletB,.016,.086,.086,0,0,0,white);port('wall.mac','outletB',[-.016,0,0],'AC 墙插','x');
const wan=addDevice('wan','B 墙 RJ45 网线出口',[.016,.07,.07],[-.012,.535,.79],'fixed','高度和沿墙位置未指定，暂按离地 53.5 cm、距 A 墙 79 cm；连接路由器背面 WAN 口。');box(wan,.016,.07,.07,0,0,0,white);port('wall.wan','wan',[-.01,0,0],'RJ45 网口','x');
// Furniture and all device children share their device identity for ray picking.
for(const dev of Object.values(devices)){dev.group.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.userData.device=dev.id;deviceMeshes.push(o);}});const label=sprite(dev.name,.26);label.position.set(0,dev.id==='desk'?.8:dev.size[1]/2+.035,0);dev.group.add(label);deviceLabels.push(label);label.visible=false;}
// Corner-rounded cable centerlines with explicit rear-edge routing anchors.
const P=(x,y,z,mobility='fixed')=>({pos:[x,y,z],mobility});
const W=(y,z)=>({pos:[0,y,z],mobility:'fixed',wallGap:true});
const at=(anchor,h)=>{const a=typeof anchor==='string'?ports[anchor]:anchor;const p=V(...a.pos);if(a.wallGap)p.x=-shelfGap/2;if(a.mobility==='desk'||a.mobility==='hub'&&hubMode==='moving')p.y+=h-.75;return p;};
// Routing anchors define the corridor, not hard corners of a rigid pipe.
// Use broad tangent-continuous bends, plus gentle droop on unobstructed spans.
// Keep narrow rear-edge passages constrained instead of applying an unconstrained
// Catmull-Rom spline that could cut through the desk or overshoot the walls.
const curveCache=new Map();
function obstaclesFor(c,h){
  const boxes=[new THREE.Box3(V(-1.55,h-.025,.02),V(-.35,h,.82))];
  const endpointIds=[ports[c.a].device,ports[c.b].device];
  for(const id of ['upper','lower','pc','mac','das','router','monitor','speakerL','speakerR','charging','clock','keyboard','track','mouse','hub','remote']){
    if(endpointIds.includes(id))continue;
    const d=devices[id],center=at({pos:d.pos,mobility:d.mobility},h),half=V(...d.size).multiplyScalar(.5);
    boxes.push(new THREE.Box3(center.clone().sub(half),center.clone().add(half)));
  }
  // Include the cable radius in the clearance test.
  for(const box of boxes)box.expandByScalar(.0028);
  return boxes;
}
function clearCurve(curve,boxes){
  const count=32;
  for(let i=0;i<=count;i++){
    const p=curve.getPoint(i/count);
    if(p.x>-.0028||p.z<.0028||p.y<.003)return false;
    if(boxes.some(b=>b.containsPoint(p)))return false;
  }
  return true;
}
function DrapedSpan(a,b,offset){
  const span=new THREE.Curve();span.a=a.clone();span.b=b.clone();span.offset=offset.clone();span.arcLengthDivisions=48;
  span.getPoint=function(t,target=new THREE.Vector3()){
    // Zero displacement AND zero slope at each attachment: no new kink where
    // the free span joins a bend. This is a visual droop model, not a solver.
    return target.lerpVectors(this.a,this.b,t).addScaledVector(this.offset,16*t*t*(1-t)*(1-t));
  };return span;
}
function curveFor(c,h){
  const key=c.id+':'+h.toFixed(4)+':'+hubMode+':'+shelfGap.toFixed(4);
  if(curveCache.has(key))return curveCache.get(key);
  const p=c.path.map(x=>at(x,h)).filter((p,i,a)=>!i||p.distanceTo(a[i-1])>.00001);
  if(c.type==='wireless'){
    const result=new THREE.CatmullRomCurve3(p,false,'centripetal');curveCache.set(key,result);return result;
  }
  const boxes=obstaclesFor(c,h),curve=new THREE.CurvePath();
  const motion=a=>{const q=typeof a==='string'?ports[a]:a;return q.mobility==='desk'||q.mobility==='hub'&&hubMode==='moving'?'moving':'fixed';};
  curve.arcLengthDivisions=600;
  function span(a,b,free=false){
    const length=a.distanceTo(b);
    if(length<1e-6)return;
    if(!free||length<.09){curve.add(new THREE.LineCurve3(a,b));return;}
    const direction=b.clone().sub(a).normalize();
    // Gravity projected across the chord produces visible slack. Near-vertical
    // desk-to-floor runs bow gently toward the open side of the desk.
    let down=V(0,-1,0).addScaledVector(direction,direction.y);
    if(down.length()<.2)down=V(-1,0,0).addScaledVector(direction,direction.x);
    down.normalize();
    let amount=Math.min(.065,length*.13);
    for(let trial=0;trial<8;trial++){
      const sag=new DrapedSpan(a,b,down.clone().multiplyScalar(amount));
      if(clearCurve(sag,boxes)){curve.add(sag);return;}
      amount*=.5;
    }
    curve.add(new THREE.LineCurve3(a,b));
  }
  let prev=p[0];
  for(let i=1;i<p.length-1;i++){
    const a=p[i-1],b=p[i],d=p[i+1];
    // Trim up to 44% on either side; neighboring bends cannot overlap.
    // Maximum trim was only 2.3 cm in the original rigid-looking routes.
    let trim=Math.min(.115,a.distanceTo(b)*.44,b.distanceTo(d)*.44);
    let enter,leave,bend;
    for(let trial=0;trial<12;trial++){
      enter=b.clone().lerp(a,trim/a.distanceTo(b));
      leave=b.clone().lerp(d,trim/b.distanceTo(d));
      bend=new THREE.QuadraticBezierCurve3(enter,b,leave);
      bend.arcLengthDivisions=40;
      if(clearCurve(bend,boxes))break;
      trim*=.65;
    }
    span(prev,enter,motion(c.path[i-1])!==motion(c.path[i]));curve.add(bend);prev=leave;
  }
  span(prev,p[p.length-1],motion(c.path[c.path.length-2])!==motion(c.path[c.path.length-1]));
  curveCache.set(key,curve);return curve;
}
function cable(id,name,type,a,b,path,protocol,note='',route='',fixedLength=null){const c={id,name,type,a,b,path:[a,...path,b],protocol,note,route,fixedLength};cables.push(c);return c;}
cable('dp','PC → 显示器 · DP','video','pc.dp','monitor.dp',[P(-.401,.514,.1255),P(-.401,.693,.1255,'desk'),P(-.419,.706,.012,'desk'),P(-1.16,.706,.012,'desk'),P(-1.16,.816,.012,'desk'),P(-1.16,.964,.095,'desk')],'DisplayPort · 版本 / 分辨率待确认','由 PC 外侧 I/O 面直接上行到桌底；高分辨率或高刷新率请按目标规格选认证线。','PC 外侧接口 → 直接上行 → 桌底后沿 → 显示器背面');
cable('hdmi','Mac Mini → 显示器 · HDMI','video','mac.hdmi','monitor.hdmi',[P(-.075,.616,.403),P(-.075,.631,.313),P(-.407,.631,.313),P(-.417,.698,.309,'desk'),P(-.426,.70,.009,'desk'),P(-1.127,.70,.009,'desk'),P(-1.127,.816,.009,'desk'),P(-1.127,.964,.109,'desk')],'HDMI · 版本 / 分辨率待确认','Mac 背面朝 B 墙；利用 PC 与 Mac/DAS 之间约 5.25 cm 的通道，在上层板下方向桌侧穿出，再沿桌侧升降段接入桌底。HDMI 性能须按实际显示模式核对。','Mac 背面 → PC 与 Mac/DAS 之间 → 桌侧升降段 → 桌下后沿 → 显示器背面');
cable('lan-pc','路由器 → Windows PC','ethernet','router.pc','pc.lan',[P(-.023,.464,.657),P(-.033,.652,.315),P(-.381,.647,.315),P(-.39,.601,.0915)],'以太网 · RJ45，速率待确认','可按目标速率选 Cat 6 成品线；不假定路由器或主机支持 2.5 / 10 GbE。','路由器背面 LAN 1 → 主机背侧 → PC 与 Mac/DAS 之间 → PC 外侧网口');
cable('lan-mac','路由器 → Mac Mini','ethernet','router.mac','mac.lan',[P(-.021,.454,.722),P(-.04,.534,.578),P(-.077,.616,.438)],'以太网 · RJ45，速率待确认','','路由器背面 LAN 2 → B 墙侧间隙 → Mac 背面');
cable('wan','墙面网口 → 路由器 WAN','ethernet','wall.wan','router.wan',[P(-.033,.535,.79),P(-.025,.487,.662),P(-.025,.429,.662)],'以太网 · RJ45 WAN','墙面出口位置为估算，需按实测位置修正。','B 墙网口 → 路由器背面 WAN');
cable('das','DAS → Mac Mini','usb','das.usb','mac.das',[P(-.074,.454,.506),P(-.073,.601,.494)],'USB-C · USB 数据，速率待确认','需选带数据能力的 USB-C 线；接口形状并不代表 USB 3.x / USB4 或 Thunderbolt。','DAS 背面 → 两机背面间的短弯 → 正上方 Mac Mini');
cable('mac-power','B 墙插座 → Mac Mini','power','wall.mac','mac.ac',[P(-.047,.886,.49),P(-.039,.845,.495),W(.828,.504),W(.738,.513),P(-.063,.655,.524),P(-.072,.616,.524)],'AC 市电 · 按设备额定规格','Mac 端暂按 IEC C7 / 8 字线。电源线就近沿 B 墙，在层板背后的缝隙内向下，再接 Mac 背面；缝宽默认为 8 mm，可调整。缝宽与插头通过方式需按实物核对。','B 墙 90 cm 插座 → 层板与 B 墙的缝隙下行 → Mac 背面');
cable('pc-power','A 墙插座 → Windows PC','power','wall.pc','pc.ac',[P(-.95,.214,.054),P(-.447,.353,.064),P(-.432,.436,.092),P(-.39,.436,.0975)],'AC 市电 · 按设备额定规格','PC 端暂按 IEC C13 线端插入机身 C14；壁插制式及额定电流待确认。','A 墙 20 cm 插座 → 下层板左侧 → PC 外侧电源接口');
cable('strip-power','A 墙插座 → 桌下插排','power','wall.strip','strip.mains',[P(-.935,.226,.066),P(-1.178,.577,.077,'desk'),P(-1.18,.679,.09,'desk')],'AC 市电 · 插排主进线','补充假设：插排进线接 A 墙双位插座另一插位。实际安装时须确认该插位存在、供电容量及原装进线长度。','固定墙插 → 自由升降段 → 桌下插排');
cable('monitor-power','桌下插排 → 显示器','power','strip.monitor','monitor.ac',[P(-1.095,.632,.092,'desk'),P(-.751,.642,.009,'desk'),P(-.75,.82,.009,'desk'),P(-.75,.956,.08,'desk')],'AC 市电 · 显示器供电','显示器端暂按 IEC C13 / C14；如使用外置适配器，需重新实测两段线长。','桌下插排 → 桌面后沿 → 显示器背面');
cable('charging-power','桌下插排 → USB 充电 Hub','power','strip.charging','charging.ac',[P(-1.022,.633,.092,'desk'),P(-1.16,.654,.009,'desk'),P(-1.16,.777,.009,'desk'),P(-1.16,.771,.326,'desk')],'AC → DC · 充电 Hub 供电','插排侧含假设电源适配器，DC 插头尺寸与输出电压待按实物核对。长度为适配器输出布线段，适配器直接插入插排。','桌下插排适配器 → 桌后沿上翻 → 桌面充电 Hub');
cable('hub-power','桌下插排 → USB 扩展 Hub','power','strip.hub','hub.power',[P(-.949,.615,.092,'desk'),P(-.448,.665,.014,'desk'),P(-.397,.657,.014,'desk'),P(-.391,.65,.017,'hub'),P(-.39,.65,.465,'hub')],'AC → DC · 切换器供电','插排侧含假设适配器；先走向 A 墙后沿，再下降接右腿 Hub。电源规格须与切换器一致。','桌下插排 → A 墙侧后沿 → 下行 → 右桌腿 Hub');
cable('clock-power','桌下插排 → 电子闹钟','power','strip.clock','clock.ac',[P(-.876,.631,.092,'desk'),P(-.703,.657,.008,'desk'),P(-.703,.779,.008,'desk'),P(-.703,.77,.327,'desk')],'USB 供电 · 电压 / 电流待确认','假设使用插排上的 USB 电源适配器，闹钟端暂按 USB-C。','桌下插排适配器 → 桌后沿 → 闹钟背面');
cable('monitor-usb','显示器 → USB 扩展 Hub · USB-C','usb','monitor.upstream','hub.monitor',[P(-.86,.924,.129,'desk'),P(-.86,.817,.012,'desk'),P(-.86,.698,.012,'desk'),P(-.389,.682,.012,'desk'),P(-.382,.65,.044,'hub'),P(-.381,.65,.362,'hub')],'USB-C → USB-C · 显示器 USB 数据上行，速率待确认','连接显示器 USB-C 上行口与扩展 Hub 的 USB-C 下行数据口，使显示器内置 USB-A Hub 及其键盘接入当前选中的主机。使用支持数据传输的 C to C 线；此线按 USB 数据用途建模，显示信号仍走 DP / HDMI。','显示器背面 USB-C → 桌后沿下行 → 桌底后沿 → 右桌腿 Hub USB-C 下行口');
cable('keyboard','显示器 → 键盘','usb','monitor.usba','keyboard.usb',[P(-.82,.924,.145,'desk'),P(-.832,.867,.146,'desk'),P(-.89,.777,.29,'desk'),P(-1.032,.772,.486,'desk')],'USB-A → USB-C · 数据 / 供电','有线数据链路：键盘 → 显示器 USB-A → 显示器 USB-C 上行 → 桌腿 USB 扩展 Hub → 当前选中的 Windows PC / Mac Mini。键盘也可按实际输入模式使用 2.4 GHz 接收器。','显示器背面 USB-A → 屏幕下方 → 避开桌面设备 → 键盘后侧 USB-C');
cable('track-charge','充电 Hub → Magic Trackpad','power','charging.track','track.usb',[P(-1.117,.765,.438,'desk'),P(-.824,.762,.504,'desk')],'USB-C → Lightning · 仅标注充电','该连接按用户指定作为充电线，以电源黄色显示；未推断 Trackpad 与主机的蓝牙配对关系。','桌面充电 Hub → Trackpad 后侧 Lightning');
cable('headphones','显示器 → 头戴式耳机','audio','monitor.audio','headset.audio',[P(-.785,1.015,.104,'desk'),P(-1.296,1.015,.115,'desk'),P(-1.369,1.02,.179,'desk')],'模拟立体声 · 3.5 mm TRS','路径只覆盖放在音响上方时的收纳状态；实际佩戴时需要另外考虑头部活动距离。','显示器背面音频输出 → 左音响上方耳机');
cable('host-pc','Windows PC → USB 扩展 Hub','usb','pc.usb','hub.pc',[P(-.399,.647,.12),P(-.431,.65,.31,'hub')],'USB-C → USB-C · 主机上行 1','需支持 USB 数据，速率按切换器和 PC 端口确认。切换器不一定支持 USB4 / Thunderbolt。','PC 外侧 I/O → 桌侧自由段 → 就近接右桌腿 Hub 上行 1');
cable('host-mac','Mac Mini → USB 扩展 Hub','usb','mac.host','hub.mac',[P(-.067,.616,.463),P(-.067,.631,.321),P(-.409,.631,.321),P(-.411,.65,.327,'hub')],'USB-C → USB-C · 主机上行 2','与 HDMI 一同利用 PC 与 Mac/DAS 之间的通道，穿出后就近接 Hub。主机到桌腿的自由段承担升降；需按实际速率选数据线。','Mac 背面 → PC 与 Mac/DAS 之间 → 就近上行 → 右桌腿 Hub 上行 2');
cable('mic','微型麦克风 → USB 扩展 Hub','usb','mic.usb','hub.mic',[P(-.738,.782,.225,'desk'),P(-.739,.777,.014,'desk'),P(-.383,.777,.009,'desk'),P(-.385,.65,.012,'hub'),P(-.382,.65,.381,'hub')],'USB 数据 · Hub 端 USB-A','麦克风端未给出，暂按 USB-C；先朝 A 墙桌面后沿走线，再下降接 Hub。','麦克风背面 → 桌面后沿 → 后沿向下 → 右桌腿 USB-A');
cable('remote','远程切换控制线 · 1.5 m','control','remote.control','hub.remote',[P(-.549,.763,.201,'desk'),P(-.548,.766,.006,'desk'),P(-.371,.766,.006,'desk'),P(-.372,.65,.006,'hub'),P(-.374,.65,.439,'hub')],'专用有线切换控制 · 具体协议待确认','原装控制线固定为 1.5 m。专用接口不可按外形推断协议，也不建议默认使用普通 USB 延长线。','控制器 → A 墙侧桌面后沿 → 后沿向下 → Hub 遥控口',1.5);
// Wireless paths are spatial schematics, excluded from cable buying lengths.
ports['mouse.rf']={device:'mouse',pos:[-.652,.789,.667],mobility:'desk',kind:'2.4 GHz 无线'};ports['keyboard.rf']={device:'keyboard',pos:[-1.025,.78,.665],mobility:'desk',kind:'2.4 GHz 无线'};ports['rxmouse.rf']={device:'rxmouse',pos:[-.386,.65,.406],mobility:'hub',kind:'USB-A 接收器 / 2.4 GHz'};ports['rxkey.rf']={device:'rxkey',pos:[-.386,.65,.422],mobility:'hub',kind:'USB-A 接收器 / 2.4 GHz'};
cable('mouse-rf','鼠标 ⇢ 2.4 GHz 接收器','wireless','mouse.rf','rxmouse.rf',[P(-.592,.81,.787,'desk'),P(-.355,.69,.761,'hub')],'2.4 GHz · 厂商私有无线','虚线仅表示逻辑无线关联，不是线材，不参与长度采购。接收器直接插入 USB 扩展 Hub。','鼠标 ⇢ USB-A 接收器 → USB 扩展 Hub');
cable('keyboard-rf','键盘 ⇢ 2.4 GHz 接收器','wireless','keyboard.rf','rxkey.rf',[P(-.964,.796,.777,'desk'),P(-.36,.684,.773,'hub')],'2.4 GHz · 厂商私有无线','虚线仅表示逻辑无线关联。键盘同时画出用户要求的 USB 线；具体输入模式由键盘及显示器上行状态决定。','键盘 ⇢ USB-A 接收器 → USB 扩展 Hub');
function compute(c){const now=curveFor(c,height).getLength(),top=curveFor(c,maxHeight).getLength();let peak=top,peakAt=maxHeight;for(let cm=75;cm<=Math.round(maxHeight*100);cm++){let l=curveFor(c,cm/100).getLength();if(l>peak+1e-8){peak=l;peakAt=cm/100;}}const reserve=Math.max(.2,peak*.15),need=peak+reserve;const sizes=[.3,.5,.75,1,1.5,2,3,5,7.5,10];const recommended=sizes.find(x=>x>=need)||Math.ceil(need);c.metrics={now,top,peak,peakAt,reserve,need,recommended,spare:c.fixedLength==null?null:c.fixedLength-peak};return c.metrics;}
function buildWires(){while(wireRoot.children.length){const o=wireRoot.children[0];o.geometry?.dispose();o.material?.dispose();wireRoot.remove(o);}cableMeshes.length=0;
for(const c of cables){const curve=curveFor(c,height);c.curve=curve;compute(c);let o;if(c.type==='wireless'){const g=new THREE.BufferGeometry().setFromPoints(curve.getPoints(90));o=new THREE.Line(g,new THREE.LineDashedMaterial({color:COLORS[c.type],dashSize:.017,gapSize:.013,transparent:true,opacity:.65}));o.computeLineDistances();}else{const g=new THREE.TubeGeometry(curve,Math.max(240,Math.ceil(curve.getLength()*420)),.0025,10,false);o=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:COLORS[c.type],roughness:.48,transparent:true}));o.castShadow=true;}o.userData.cable=c.id;wireRoot.add(o);c.mesh=o;cableMeshes.push(o);
// Small metal connector collars and color-coded endpoint rings are part of the same selectable cable.
if(c.type!=='wireless')for(const t of[0,1]){const point=curve.getPoint(t),next=curve.getPoint(t===0?.004:.996);const plug=cyl(wireRoot,.0035,.009,...point.toArray(),new THREE.MeshStandardMaterial({color:COLORS[c.type],roughness:.4,transparent:true}));plug.quaternion.setFromUnitVectors(V(0,1,0),next.sub(point).normalize());plug.userData.cable=c.id;plug.userData.endpoint=true;cableMeshes.push(plug);}
}applyVisibility();}
function applyVisibility(){const focus=selected?.kind==='cable'?selected.id:null;const isolate=plannerEl('isolate').checked,ghost=plannerEl('ghost').checked;const fc=focus?cables.find(c=>c.id===focus):null;const endpointIds=fc?[ports[fc.a].device,ports[fc.b].device]:[];for(const o of deviceMeshes){const end=endpointIds.includes(o.userData.device);const trans=ghost&&!end;if(o.material.transparent!==trans){o.material.transparent=trans;o.material.needsUpdate=true;}o.material.depthTest=!(ghost&&end);o.renderOrder=ghost&&end?4:0;o.material.opacity=ghost&&!end?(['desk','upper','lower'].includes(o.userData.device)?.055:.12):1;o.material.depthWrite=!ghost||end;}for(const o of cableMeshes){const isSelected=focus===o.userData.cable;const c=cables.find(c=>c.id===o.userData.cable);o.visible=!isolate||!focus||isSelected;o.material.opacity=focus&&!isSelected?.09:(c.type==='wireless'?.7:1);o.material.depthWrite=!focus||isSelected;o.material.depthTest=!(ghost&&isSelected);o.renderOrder=isSelected?5:0;if(o.material.emissive){o.material.emissive.setHex(isSelected?COLORS[c.type]:0);o.material.emissiveIntensity=isSelected?.32:0;}if(!o.userData.endpoint&&o.isMesh){o.scale.setScalar(1);}}
wallMat.opacity=wallGhost?.17:1;if(wallMat.transparent!==wallGhost){wallMat.transparent=wallGhost;wallMat.needsUpdate=true;}wallMat.depthWrite=!wallGhost;
for(const l of deviceLabels)l.visible=plannerEl('labels').checked;dims.visible=dimensionOn;
}
function dim(a,b,label,offset=[0,0,0]){const aa=V(...a),bb=V(...b),mat=new THREE.LineBasicMaterial({color:0x76916f,depthTest:false,transparent:true,opacity:.85});const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([aa,bb]),mat);line.renderOrder=10;dims.add(line);for(const p of[aa,bb]){const s=sphere(dims,.004,...p.toArray(),material(0x789471));s.renderOrder=10;}const s=sprite(label,.24);s.position.copy(aa.add(bb).multiplyScalar(.5).add(V(...offset)));dims.add(s);}
function updateDimensions(){while(dims.children.length){const o=dims.children[0];o.geometry?.dispose();if(o.material?.map)o.material.map.dispose();o.material?.dispose();dims.remove(o);}dim([-1.55,height+.012,.875],[-.35,height+.012,.875],'桌宽 120 cm',[0,.02,0]);dim([-1.61,height,.02],[-1.61,height,.82],'桌深 80 cm',[-.055,.02,0]);dim([-.35,height+.05,.92],[0,height+.05,.92],'墙侧 35 cm',[0,.025,0]);dim([-1.65,0,.12],[-1.65,height,.12],`桌高 ${Math.round(height*100)} cm`,[-.03,0,0]);dim([-.2,.4,.865],[-.2,.8,.865],'层板 40 / 80 cm',[0,.02,.055]);dim([-.34-shelfGap,.817,.84],[-shelfGap,.817,.84],'上层深 34 cm',[0,.024,0]);dim([-.4-shelfGap,.408,.905],[-shelfGap,.408,.905],'下层深 40 cm',[0,-.035,0]);dim([-shelfGap,.83,.56],[0,.83,.56],`墙后缝 ${Math.round(shelfGap*1000)} mm`,[-.09,.04,0]);dim([-.2,.65,.2875],[-.2,.65,.34],'设备间通道 5.25 cm',[0,.035,0]);dim([-.95,height,.41],[-.95,height+.15,.41],'屏底留空 15 cm',[.12,0,0]);}
let cameraTween=null;
function setView(pos,target,animated=true){if(!animated||matchMedia('(prefers-reduced-motion: reduce)').matches){camera.position.copy(pos);controls.target.copy(target);controls.update();cameraTween=null;return;}cameraTween={from:camera.position.clone(),to:pos,startTarget:controls.target.clone(),target,start:performance.now()};}
function reset(){setView(V(-2.88,2.14,3.02),V(-.76,.73,.36));}
function fitCable(c){const points=c.curve.getPoints(100),box3=new THREE.Box3().setFromPoints(points),center=box3.getCenter(new THREE.Vector3()),size=box3.getSize(new THREE.Vector3());const radius=Math.max(.19,size.length()/2);const minFov=Math.min(camera.fov*Math.PI/180,2*Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));const distance=Math.max(.7,radius/Math.sin(minFov/2)*1.2);const dir=V(-1,.58,1.15).normalize();setView(center.clone().addScaledVector(dir,distance),center);}
function focusDevice(id){const d=devices[id];const center=at({pos:d.pos,mobility:d.mobility},height);if(id==='desk')center.y=height;const r=Math.max(...d.size);const dist=Math.max(.6,r*3);setView(center.clone().add(V(-1,.7,1).normalize().multiplyScalar(dist)),center);}
const fmt=x=>x.toFixed(2),cm=x=>Math.round(x*100),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function select(kind,id,moveCamera=true){selected={kind,id};tab=kind==='device'?'devices':'cables';if(kind==='cable'){if(zoneSelection!=='all')zoneSelection=cableZone(cables.find(c=>c.id===id));plannerEl('ghost').checked=true;if(moveCamera)fitCable(cables.find(c=>c.id===id));}else if(moveCamera)focusDevice(id);applyVisibility();renderDetail();renderInventory();syncTabs();if(root.clientWidth>900){const a=root.querySelector('aside');a.scrollTo({top:plannerEl('detail').offsetTop-a.offsetTop,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}
function clear(){selected=null;plannerEl('ghost').checked=false;plannerEl('isolate').checked=false;applyVisibility();renderDetail();renderInventory();}
function badge(){plannerEl('viewport').classList.toggle('focused',selected?.kind==='cable');if(selected?.kind==='cable'){const c=cables.find(c=>c.id===selected.id);plannerEl('scene-badge').textContent='FOCUS · '+c.name;plannerEl('scene-badge').className='float-badge focus-badge';}else{plannerEl('scene-badge').textContent=`桌高 ${cm(height)} cm · 最高 ${cm(maxHeight)} cm`;plannerEl('scene-badge').className='float-badge';}}
function renderDetail(){badge();if(!selected){plannerEl('detail').innerHTML=`<h2 class="empty-head">看清连接，再决定线长。</h2><p class="body-copy">点选模型中的线材，或从下方清单选择。Focus 会透视设备，并显示完整路径与升降需求。</p><div class="overview-numbers"><div><b>${cables.filter(c=>c.type!=='wireless').length}</b><span>条实体线材</span></div><div><b>${cables.filter(c=>c.type==='wireless').length}</b><span>条无线关联</span></div><div><b>${cm(maxHeight)-75}</b><span>cm 升降行程</span></div></div>`;return;}
if(selected.kind==='device'){const d=devices[selected.id],p=at({pos:d.pos,mobility:d.mobility},height);const attached=cables.filter(c=>ports[c.a].device===d.id||ports[c.b].device===d.id);plannerEl('detail').innerHTML=`<div class="section-head"><h2 class="detail-title">${esc(d.name)}</h2><button class="close" id="close-detail" aria-label="取消选择">×</button></div><span class="pill">${d.mobility==='desk'?'随桌升降':d.mobility==='hub'?(hubMode==='moving'?'随桌腿升降':'固定离地'):'固定位置'}</span><div class="meta-row"><span>外形尺寸</span><strong>${d.size.map(x=>+(x*100).toFixed(1)).join(' × ')} cm<br><span>X 宽 × 高 × Z 深</span></strong></div><div class="meta-row"><span>中心高度</span><strong>${d.id==='desk'?cm(height)+' cm（桌面）':cm(p.y)+' cm'}</strong></div><p class="note">${esc(d.description)}</p>${d.ports.length?`<div class="device-note">接口：${d.ports.map(p=>esc(p.kind)).join(' · ')}</div>`:''}<div class="detail-actions"><button id="device-fit">定位设备</button><button id="device-lines">查看 ${attached.length} 条关联</button></div>`;plannerEl('close-detail').onclick=clear;plannerEl('device-fit').onclick=()=>focusDevice(d.id);plannerEl('device-lines').onclick=()=>{tab='cables';zoneSelection='all';plannerEl('search').value=d.name==='USB 扩展 Hub / 双主机切换器'?'USB 扩展':d.name;plannerEl('filter').value='all';syncTabs();renderInventory();};return;}
const c=cables.find(c=>c.id===selected.id),m=c.metrics,pa=ports[c.a],pb=ports[c.b],wireless=c.type==='wireless';let warning='';if(c.fixedLength){const ok=c.fixedLength>=m.need;warning=`<p class="note ${ok?'':'warning-note'}">原装 <b>1.50 m</b>：${ok?'满足当前规划的全行程及预留量。':c.fixedLength>=m.peak?'能覆盖几何路径，但预留量不足。':'不足以覆盖全行程路径。'} 全行程净余量 ${fmt(m.spare)} m；含建议预留后 ${fmt(c.fixedLength-m.need)} m。</p>`;}
plannerEl('detail').innerHTML=`<div class="section-head"><h2 class="detail-title">${esc(c.name)}</h2><button class="close" id="close-detail" aria-label="退出 Focus">×</button></div><span class="pill">${zoneName(c)} · ${TYPES[c.type]} · ${wireless?'逻辑连接':'Focus'}</span><div class="endpoints"><div class="endpoint">${esc(devices[pa.device].name)}<small>${esc(pa.kind)}</small></div><div class="endpoint">${esc(devices[pb.device].name)}<small>${esc(pb.kind)}</small></div></div>${wireless?'<p class="note">2.4 GHz 虚线表示无线配对，无实体接口线长与采购长度。</p>':`<div class="metrics"><div class="metric"><span>当前路径 / ${cm(height)} cm 桌位</span><strong>${fmt(m.now)}<small>m</small></strong></div><div class="metric"><span>最高桌位 / ${cm(maxHeight)} cm</span><strong>${fmt(m.top)}<small>m</small></strong></div><div class="metric recommend"><span>建议线长${c.fixedLength?'（等效需求）':''}<br><small>含全行程 + 预留量</small></span><strong>${String(m.recommended)}<small>m</small></strong></div></div><p class="note">全行程最大 ${fmt(m.peak)} m（${cm(m.peakAt)} cm 桌位）；另留 ${fmt(m.reserve)} m，最低备线 ${fmt(m.need)} m。${m.top-m.now>.01?' 当前到最高桌位增加 '+fmt(m.top-m.now)+' m。':''}</p>${warning}`}
<div class="meta-row"><span>协议</span><strong>${esc(c.protocol)}</strong></div><div class="route">路径 · ${esc(c.route)}</div>${c.note?`<p class="note ${''}">${esc(c.note)}</p>`:''}<div class="detail-actions"><button id="refit">定位整条路径</button><button id="check-max">查看最高桌位</button></div>`;
plannerEl('close-detail').onclick=clear;plannerEl('refit').onclick=()=>fitCable(c);plannerEl('check-max').onclick=()=>{setHeight(maxHeight);fitCable(c);};}
const CABLE_ZONES=[
  {id:'shelf',name:'下层层板',description:'固定设备互连，以及这些设备的墙面电源、网口接入'},
  {id:'cross',name:'跨区域连接',description:'层板、墙面与桌面或桌腿之间；留意固定端与升降端'},
  {id:'moving',name:'随桌升降',description:'两端都随桌移动，整体升降时相对距离不变'},
  {id:'wireless',name:'无线',description:'2.4 GHz 配对关系，不计实体线长'}
];
let zoneSelection='all';
const shelfDevices=new Set(['pc','mac','router','das']);
const shelfAccess=new Set([...shelfDevices,'outletA','outletB','wan']);
function cableZone(c){
  if(c.type==='wireless')return 'wireless';
  const a=ports[c.a],b=ports[c.b];
  if(shelfAccess.has(a.device)&&shelfAccess.has(b.device)&&(shelfDevices.has(a.device)||shelfDevices.has(b.device)))return 'shelf';
  const moves=p=>p.mobility==='desk'||p.mobility==='hub'&&hubMode==='moving';
  return moves(a)&&moves(b)?'moving':'cross';
}
function zoneName(c){return CABLE_ZONES.find(z=>z.id===cableZone(c)).name;}
function syncTabs(){plannerEl('tab-cables').classList.toggle('active',tab==='cables');plannerEl('tab-devices').classList.toggle('active',tab==='devices');plannerEl('filter').style.display=tab==='cables'?'':'none';plannerEl('zone-controls').hidden=tab!=='cables';}
function renderZoneControls(){
  const entries=[{id:'all',name:'全部'},...CABLE_ZONES];
  plannerEl('zone-controls').innerHTML=entries.map(z=>`<button type="button" data-zone-filter="${z.id}" class="${zoneSelection===z.id?'active':''}" aria-pressed="${zoneSelection===z.id}">${z.name}<span>${z.id==='all'?cables.length:cables.filter(c=>cableZone(c)===z.id).length}</span></button>`).join('');
  for(const button of plannerEl('zone-controls').querySelectorAll('button'))button.onclick=()=>{zoneSelection=button.dataset.zoneFilter;renderInventory();};
}
function cableItem(c){
  const wireless=c.type==='wireless';
  return `<button class="item ${selected?.kind==='cable'&&selected.id===c.id?'active':''} ${c.fixedLength&&c.fixedLength<c.metrics.need?'warning':''}" data-kind="cable" data-id="${c.id}"><i class="cable-dot" style="--c:#${COLORS[c.type].toString(16).padStart(6,'0')}"></i><div><div class="item-title">${esc(c.name)}</div><div class="item-sub">${esc(ports[c.a].kind)} → ${esc(ports[c.b].kind)}</div></div><div class="item-length">${wireless?'···':c.fixedLength?'1.5 m':c.metrics.recommended+' m'}<small>${wireless?'无线':c.fixedLength?'已有':'建议'}</small></div></button>`;
}
function renderInventory(){
  const q=plannerEl('search').value.trim().toLowerCase(),type=plannerEl('filter').value;let items='';
  renderZoneControls();
  if(tab==='cables'){
    for(const zone of CABLE_ZONES){
      if(zoneSelection!=='all'&&zoneSelection!==zone.id)continue;
      const group=cables.filter(c=>cableZone(c)===zone.id);
      const visible=group.filter(c=>(type==='all'||c.type===type)&&(!q||[c.name,c.protocol,devices[ports[c.a].device].name,devices[ports[c.b].device].name,ports[c.a].kind,ports[c.b].kind,zone.name].join(' ').toLowerCase().includes(q)));
      if(!visible.length)continue;
      items+=`<div class="cable-group" data-zone="${zone.id}"><h3>${zone.name}<span>${visible.length===group.length?group.length:visible.length+' / '+group.length} ${zone.id==='wireless'?'组':'条'}</span></h3><p>${zone.description}</p>${visible.map(cableItem).join('')}</div>`;
    }
  }else{
    for(const d of Object.values(devices)){
      if(q&&!(d.name+' '+d.description).toLowerCase().includes(q))continue;
      items+=`<button class="item ${selected?.kind==='device'&&selected.id===d.id?'active':''}" data-kind="device" data-id="${d.id}"><span class="device-dot">${d.mobility==='fixed'?'F':d.mobility==='hub'?'H':'↑'}</span><div><div class="item-title">${esc(d.name)}</div><div class="item-sub">${d.size.map(x=>+(x*100).toFixed(1)).join(' × ')} cm</div></div><div class="item-length">⌖</div></button>`;
    }
  }
  plannerEl('inventory').innerHTML=items||'<div class="no-results">没有匹配项</div>';
  for(const el of plannerEl('inventory').querySelectorAll('[data-id]'))el.onclick=()=>select(el.dataset.kind,el.dataset.id);
}
function setHeight(h){height=Math.min(maxHeight,Math.max(.75,h));moving.position.y=height-.75;hubRoot.position.y=hubMode==='moving'?height-.75:0;for(const leg of legs){const bottom=.345,top=height-.055;leg.scale.y=(top-bottom)/.31;leg.position.y=(top+bottom)/2;}plannerEl('height').value=cm(height);plannerEl('height-out').textContent=cm(height);plannerEl('sit').classList.toggle('active',Math.abs(height-.75)<.001);plannerEl('stand').classList.toggle('active',Math.abs(height-maxHeight)<.001);buildWires();updateDimensions();renderDetail();renderInventory();}
function exportPlan(){const rows=[['位置分组','线材类型','线材','连接对象A','A接口','连接对象B','B接口','协议','当前桌高cm','最高桌高cm','当前路径m','最高桌位路径m','全行程最大m','预留m','最低备线m','建议长度m','已有长度m','说明']];for(const c of CABLE_ZONES.flatMap(z=>cables.filter(c=>cableZone(c)===z.id))){const m=c.metrics,w=c.type==='wireless';rows.push([zoneName(c),TYPES[c.type],c.name,devices[ports[c.a].device].name,ports[c.a].kind,devices[ports[c.b].device].name,ports[c.b].kind,c.protocol,cm(height),cm(maxHeight),w?'':fmt(m.now),w?'':fmt(m.top),w?'':fmt(m.peak),w?'':fmt(m.reserve),w?'':fmt(m.need),w?'':m.recommended,c.fixedLength??'',c.note+'；层板墙后缝 '+Math.round(shelfGap*1000)+' mm；Hub：'+(hubMode==='moving'?'随桌升降':'固定离地65cm')]);}const csv='\ufeff'+rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='桌面线材规划-'+cm(height)+'cm.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
plannerEl('export-top').onclick=plannerEl('export-bottom').onclick=exportPlan;
plannerEl('height').oninput=e=>setHeight(Number(e.target.value)/100);plannerEl('sit').onclick=()=>setHeight(.75);plannerEl('stand').onclick=()=>setHeight(maxHeight);
plannerEl('max-height').onchange=e=>{const value=Number(e.target.value);if(!Number.isFinite(value)){e.target.value=cm(maxHeight);return;}maxHeight=Math.max(.9,Math.min(1.5,value/100));e.target.value=cm(maxHeight);plannerEl('height').max=cm(maxHeight);plannerEl('max-label').textContent=cm(maxHeight)+' cm';plannerEl('stand').textContent=cm(maxHeight)+' 站姿';setHeight(height);};

function setShelfGap(mm){
  shelfGap=Math.max(.006,Math.min(.010,Number(mm)/1000||.008));
  plannerEl('shelf-gap').value=Math.round(shelfGap*1000);
  for(const [id,depth]of[['upper',.34],['lower',.4]]){
    const d=devices[id];d.pos[0]=-depth/2-shelfGap;d.group.position.x=d.pos[0];
    d.description=`已知：顶面距地 ${id==='upper'?80:40} cm，沿 B 墙宽 80 cm，板深 ${depth*100} cm。板厚暂按 2.5 cm，离 B 墙缝隙暂按 ${Math.round(shelfGap*1000)} mm。${id==='lower'?'计入墙后缝后，前沿伸入桌下 '+((.05+shelfGap)*100).toFixed(1)+' cm。':'上层前沿至桌右边缘余缝 '+Math.round((.01-shelfGap)*1000)+' mm。'}`;
  }
  curveCache.clear();setHeight(height);
}
plannerEl('shelf-gap').onchange=e=>setShelfGap(e.target.value);

plannerEl('hub-mode').onchange=e=>{hubMode=e.target.value;setHeight(height);};
plannerEl('reset').onclick=()=>{clear();reset();};plannerEl('floor-view').onclick=()=>setView(V(-2.1,.09,1.7),V(-.8,.77,.26));plannerEl('rear-view').onclick=()=>{wallGhost=true;plannerEl('wall-btn').classList.add('active');plannerEl('wall-btn').setAttribute('aria-pressed','true');applyVisibility();setView(V(.78,1.15,-1.1),V(-.62,.68,.31));};
plannerEl('wall-btn').onclick=()=>{wallGhost=!wallGhost;plannerEl('wall-btn').classList.toggle('active',wallGhost);plannerEl('wall-btn').setAttribute('aria-pressed',String(wallGhost));applyVisibility();};plannerEl('dim-btn').onclick=()=>{dimensionOn=!dimensionOn;plannerEl('dim-btn').classList.toggle('active',dimensionOn);plannerEl('dim-btn').setAttribute('aria-pressed',String(dimensionOn));dims.visible=dimensionOn;};for(const id of['ghost','labels','isolate'])plannerEl(id).onchange=applyVisibility;
plannerEl('tab-cables').onclick=()=>{tab='cables';syncTabs();renderInventory();};plannerEl('tab-devices').onclick=()=>{tab='devices';syncTabs();renderInventory();};plannerEl('search').oninput=renderInventory;plannerEl('filter').onchange=renderInventory;
// Prioritize thin wires with ray hits and a 6 px screen-space proximity fallback.
const raycaster=new THREE.Raycaster();raycaster.params.Line.threshold=.009;const pointer=new THREE.Vector2();let pointerDown=null,hovered=null;
function pick(event){const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects([...cableMeshes.filter(x=>x.visible),...deviceMeshes],false);const deviceHit=hits.find(x=>x.object.userData.device);const cableHit=hits.find(x=>x.object.userData.cable);if(cableHit&&(plannerEl('ghost').checked||!deviceHit||cableHit.distance<deviceHit.distance+.018))return{kind:'cable',id:cableHit.object.userData.cable};
// Screen-space proximity fallback, 6 px; hide occluded wires unless x-ray is enabled.
let nearest=null,nearDistance=7;for(const c of cables){if(!c.mesh.visible)continue;for(const p of c.curve.getPoints(85)){const projected=p.clone().project(camera);if(projected.z<-1||projected.z>1)continue;const sx=(projected.x+1)/2*rect.width+rect.left,sy=(-projected.y+1)/2*rect.height+rect.top;const dist=Math.hypot(sx-event.clientX,sy-event.clientY);if(dist<nearDistance&&(plannerEl('ghost').checked||!deviceHit||camera.position.distanceTo(p)<=deviceHit.distance+.025)){nearDistance=dist;nearest={kind:'cable',id:c.id};}}}return nearest||(deviceHit?{kind:'device',id:deviceHit.object.userData.device}:null);}
renderer.domElement.addEventListener('pointerdown',e=>{pointerDown={x:e.clientX,y:e.clientY,button:e.button};cameraTween=null;});
renderer.domElement.addEventListener('pointermove',e=>{if(e.buttons){plannerEl('tooltip').style.display='none';return;}hovered=pick(e);renderer.domElement.style.cursor=hovered?'pointer':'grab';if(!hovered){plannerEl('tooltip').style.display='none';return;}const name=hovered.kind==='device'?devices[hovered.id].name:cables.find(c=>c.id===hovered.id).name;plannerEl('tooltip').innerHTML=esc(name)+'<small>'+(hovered.kind==='device'?'点击查看设备与接口':'点击 Focus · 查看连接与长度')+'</small>';plannerEl('tooltip').style.display='block';const width=plannerEl('tooltip').offsetWidth;plannerEl('tooltip').style.left=Math.min(e.clientX+14,innerWidth-width-12)+'px';plannerEl('tooltip').style.top=Math.min(e.clientY+14,innerHeight-70)+'px';});
renderer.domElement.addEventListener('pointerleave',()=>plannerEl('tooltip').style.display='none');renderer.domElement.addEventListener('pointerup',e=>{if(pointerDown&&pointerDown.button===0&&Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)<5){const hit=pick(e);if(hit)select(hit.kind,hit.id);}pointerDown=null;});
root.addEventListener('keydown',e=>{if(e.key==='Escape')clear();},{signal:lifecycle.signal});controls.addEventListener('start',()=>cameraTween=null);
const ro=new ResizeObserver(()=>{const r=plannerEl('viewport').getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();});ro.observe(plannerEl('viewport'));
function frame(t){if(stopped)return;frameId=requestAnimationFrame(frame);if(cameraTween){let a=Math.min(1,(t-cameraTween.start)/650);a=a*a*(3-2*a);camera.position.lerpVectors(cameraTween.from,cameraTween.to,a);controls.target.lerpVectors(cameraTween.startTarget,cameraTween.target,a);if(a===1)cameraTween=null;}controls.update();renderer.render(scene,camera);}setView(V(-2.88,2.14,3.02),V(-.76,.73,.36),false);plannerEl('cable-count').textContent=cables.length;plannerEl('device-count').textContent=Object.keys(devices).length;setShelfGap(8);frameId=requestAnimationFrame(frame);

function readSettings() {
  return {height:cm(height),maxHeight:cm(maxHeight),hubMode,shelfGap:Math.round(shelfGap*1000),wallGhost,dimensionOn,
    ghost:plannerEl('ghost').checked,labels:plannerEl('labels').checked,isolate:plannerEl('isolate').checked};
}
function applySettings(value) {
  maxHeight=value.maxHeight/100;height=value.height/100;hubMode=value.hubMode;
  wallGhost=value.wallGhost;dimensionOn=value.dimensionOn;
  plannerEl('max-height').value=value.maxHeight;plannerEl('height').max=value.maxHeight;
  plannerEl('max-label').textContent=value.maxHeight+' cm';plannerEl('stand').textContent=value.maxHeight+' 站姿';
  plannerEl('hub-mode').value=hubMode;
  for(const key of ['ghost','labels','isolate'])plannerEl(key).checked=value[key];
  for(const [key,active] of [['wall-btn',wallGhost],['dim-btn',dimensionOn]]) {
    plannerEl(key).classList.toggle('active',active);plannerEl(key).setAttribute('aria-pressed',String(active));
  }
  setShelfGap(value.shelfGap);
}
function dispose() {
  stopped=true;cancelAnimationFrame(frameId);ro.disconnect();lifecycle.abort();controls.dispose();
  const geometries=new Set(),materials=new Set(baseMaterials),textures=new Set();
  scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);
    if(object.material)for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);
    object.shadow?.dispose();
  });
  for(const material of materials){for(const value of Object.values(material))if(value?.isTexture)textures.add(value);material.dispose();}
  for(const geometry of geometries)geometry.dispose();for(const texture of textures)texture.dispose();
  curveCache.clear();renderer.dispose();renderer.forceContextLoss();
}
return {readSettings,applySettings,dispose};

  }
</script>

<div class="desk-planner">
  <div class="persistence" role="status" aria-live="polite">
    <span>{message}</span>
    {#if failed}<button onclick={retry} disabled={busy || saving}>{pending ? '重试保存' : '重新载入'}</button>{/if}
    {#if initialized && !canEdit && !failed}<button onclick={() => loadState()} disabled={busy || saving}>恢复公开方案</button>{/if}
  </div>
  <div bind:this={root} class="application" class:pending={!initialized} inert={busy || !initialized || (failed && !pending)}>
    {@html SHELL}
  </div>
</div>

<style>
:global(.desk-planner){color-scheme:light;--ink:#263a35;--muted:#75817a;--line:#dde3dc;--paper:#fafbf7;--accent:#31694e;--yellow:#dfad17;--blue:#3a86da}:global(.desk-planner *){box-sizing:border-box}:global(.desk-planner){margin:0;background:#e9eee6;color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;font-size:13px}:global(.desk-planner button),:global(.desk-planner input),:global(.desk-planner select){font:inherit}:global(.desk-planner button){cursor:pointer;color:inherit;border:1px solid var(--line);background:var(--paper);border-radius:7px;padding:8px 12px;transition:background .15s}:global(.desk-planner button:hover){background:#e6ece3}:global(.desk-planner button:focus-visible),:global(.desk-planner input:focus-visible),:global(.desk-planner select:focus-visible){outline:2px solid #3d8d68;outline-offset:3px}:global(.desk-planner button.active){background:#2f5746;color:white;border-color:#2f5746}:global(.desk-planner header){height:78px;display:flex;align-items:center;justify-content:space-between;padding:0 28px;background:var(--paper);border-bottom:1px solid var(--line);gap:16px}:global(.desk-planner .brand){display:flex;align-items:center;gap:14px}:global(.desk-planner .mark){display:grid;place-items:center;width:38px;height:38px;background:#315f49;color:white;font-size:21px;border-radius:10px}:global(.desk-planner .eyebrow){font-size:10px;letter-spacing:2.6px;color:var(--muted);margin-bottom:5px}:global(.desk-planner h1){font-size:19px;letter-spacing:1px;font-weight:600;margin:0}:global(.desk-planner .header-meta){font-size:12px;color:var(--muted);display:flex;gap:20px;align-items:center}:global(.desk-planner .status-dot){width:7px;height:7px;display:inline-block;background:#4b8a65;border-radius:100%;margin-right:7px}:global(.desk-planner .workspace){display:grid;grid-template-columns:minmax(0,1fr) 356px;height:calc(100dvh - 78px);min-height:620px}:global(.desk-planner main){position:relative;min-width:0;overflow:hidden}:global(.desk-planner #scene){height:100%;width:100%;touch-action:none;display:block;outline:none}:global(.desk-planner .topbar){position:absolute;left:25px;right:25px;top:24px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;pointer-events:none}:global(.desk-planner .scene-title){pointer-events:none}:global(.desk-planner .scene-title h2){font-size:24px;font-weight:450;letter-spacing:1px;margin:0 0 8px}:global(.desk-planner .scene-title p){font-size:12px;color:#637466;margin:0;line-height:1.8}:global(.desk-planner .view-tools){display:flex;gap:6px;flex-wrap:wrap;max-width:300px;justify-content:flex-end;pointer-events:auto}:global(.desk-planner .view-tools button){font-size:12px;background:rgba(250,251,247,.9);backdrop-filter:blur(8px);padding:8px 10px}:global(.desk-planner .view-tools button.active){background:#315c48}:global(.desk-planner .scene-bottom){position:absolute;bottom:22px;left:25px;right:25px;display:flex;justify-content:space-between;align-items:flex-end;pointer-events:none;gap:14px}:global(.desk-planner .legend){display:flex;flex-wrap:wrap;gap:9px 16px;max-width:400px;font-size:11px;color:#52675a}:global(.desk-planner .legend span){display:flex;align-items:center;gap:6px}:global(.desk-planner .legend i){display:inline-block;width:19px;height:3px;border-radius:3px}:global(.desk-planner .legend .dash){height:0;border-top:2px dashed #af73b7}:global(.desk-planner .hint){font-size:11px;line-height:1.9;color:#6c7b70;text-align:right}:global(.desk-planner .scale-note){position:absolute;left:25px;bottom:83px;font-size:11px;color:#738477;letter-spacing:.5px}:global(.desk-planner .scale-bar){width:76px;border:1px solid #889b8c;border-top:0;height:5px;margin-bottom:5px}:global(.desk-planner .float-badge){position:absolute;left:25px;top:132px;padding:7px 10px;background:#fafbf7de;border:1px solid #d7dfd4;border-radius:5px;color:#647a66;font-size:11px;pointer-events:none}:global(.desk-planner .focus-badge){background:#2e5949ed;color:white;border:0;max-width:65%;line-height:1.6}:global(.desk-planner .tooltip){position:fixed;pointer-events:none;background:#203d33f2;color:white;max-width:280px;padding:9px 12px;border-radius:7px;font-size:12px;line-height:1.6;z-index:20;box-shadow:0 5px 22px #203d3320;display:none}:global(.desk-planner .tooltip small){display:block;color:#c4d4ca;font-size:10px}:global(.desk-planner aside){background:var(--paper);border-left:1px solid var(--line);overflow:auto;scrollbar-width:thin;scrollbar-color:#cbd4ca transparent}:global(.desk-planner section){padding:21px 23px;border-bottom:1px solid var(--line)}:global(.desk-planner .section-head){display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:13px}:global(.desk-planner .section-head h2){font-size:13px;font-weight:600;margin:0}:global(.desk-planner .subtle){font-size:11px;color:var(--muted)}:global(.desk-planner .height-value){font-size:30px;font-variant-numeric:tabular-nums;letter-spacing:-1px;font-weight:450}:global(.desk-planner .height-value small){font-size:12px;letter-spacing:0;margin-left:5px;color:var(--muted)}:global(.desk-planner .height-row){display:flex;align-items:center;justify-content:space-between;gap:12px}:global(.desk-planner .height-actions){display:flex;gap:5px}:global(.desk-planner .height-actions button){font-size:11px;padding:6px 10px}:global(.desk-planner input[type=range]){width:100%;accent-color:var(--accent);margin:14px 0 4px;height:18px;cursor:pointer}:global(.desk-planner .range-labels){display:flex;justify-content:space-between;color:#8c968e;font-size:10px}:global(.desk-planner .setting-row){margin-top:15px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px}:global(.desk-planner .setting-row input[type=number]){width:60px;border:1px solid var(--line);border-radius:4px;padding:5px;background:white;color:var(--ink)}:global(.desk-planner .setting-row select){max-width:180px;border:1px solid var(--line);padding:5px;border-radius:4px;color:var(--ink);background:white;font-size:11px}:global(.desk-planner .quick-toggle){margin-top:12px;display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:#607166}:global(.desk-planner .quick-toggle label){display:flex;align-items:center;gap:4px;cursor:pointer}:global(.desk-planner input[type=checkbox]){accent-color:var(--accent)}:global(.desk-planner .empty-head){font-size:17px;margin:0 0 9px;font-weight:500}:global(.desk-planner .body-copy){color:#718078;font-size:12px;line-height:1.8;margin:0}:global(.desk-planner .overview-numbers){display:flex;gap:32px;margin:18px 0 0}:global(.desk-planner .overview-numbers b){display:block;font-size:24px;font-weight:450}:global(.desk-planner .overview-numbers span){font-size:10px;color:#7c8a80}:global(.desk-planner .tabs){display:flex;gap:18px;border-bottom:1px solid var(--line);padding:0 23px}:global(.desk-planner .tabs button){background:none;border:0;border-radius:0;padding:17px 0 12px;color:#8a958c;font-size:12px}:global(.desk-planner .tabs button.active){color:#315f49;border-bottom:2px solid #315f49}:global(.desk-planner .list-controls){padding:15px 23px 8px;display:flex;gap:6px;align-items:center}:global(.desk-planner .list-controls input){min-width:0;width:100%;padding:8px 10px;background:#f0f3ec;border:1px solid #e6eae2;border-radius:5px;font-size:11px}:global(.desk-planner .list-controls select){padding:7px 3px;background:transparent;border:0;color:#64756b;font-size:11px;max-width:74px}:global(.desk-planner .inventory){padding:0 13px 14px}:global(.desk-planner .item){width:100%;display:flex;align-items:center;text-align:left;gap:11px;background:transparent;border:0;border-bottom:1px solid #e8ece5;border-radius:0;padding:13px 10px}:global(.desk-planner .item:hover){background:#edf2e9}:global(.desk-planner .item.active){background:#e6eee2;color:#244c37;border-radius:6px}:global(.desk-planner .cable-dot){height:23px;width:3px;background:var(--c);border-radius:3px;flex-shrink:0}:global(.desk-planner .item-title){font-size:12px;font-weight:500;line-height:1.5}:global(.desk-planner .item-sub){font-size:10px;color:#899388;line-height:1.7}:global(.desk-planner .item-length){margin-left:auto;font-size:12px;white-space:nowrap;font-variant-numeric:tabular-nums;color:#58715e}:global(.desk-planner .item-length small){font-size:9px;display:block;color:#8b978b;text-align:right}:global(.desk-planner .item.warning .item-length){color:#b57632}:global(.desk-planner .device-dot){height:22px;width:22px;background:#e0e7dc;border-radius:5px;display:grid;place-items:center;color:#526f5a;font-size:10px;flex-shrink:0}:global(.desk-planner .close){border:0;background:transparent;padding:3px 7px;color:#839080;font-size:19px}:global(.desk-planner .detail-title){font-size:17px;font-weight:500;margin:0;line-height:1.5}:global(.desk-planner .pill){display:inline-block;border:1px solid #d7dfd2;border-radius:4px;font-size:10px;padding:3px 6px;margin-top:7px;color:#708166}:global(.desk-planner .endpoints){border-left:2px solid #d5dfcf;padding-left:12px;margin-top:18px}:global(.desk-planner .endpoint){font-size:12px;line-height:1.6}:global(.desk-planner .endpoint+ .endpoint){margin-top:12px}:global(.desk-planner .endpoint small){display:block;color:#849181;font-size:10px}:global(.desk-planner .metrics){display:grid;grid-template-columns:1fr 1fr;gap:16px 12px;margin-top:20px}:global(.desk-planner .metric span){display:block;font-size:10px;color:#849181;margin-bottom:4px}:global(.desk-planner .metric strong){font-size:23px;letter-spacing:-.5px;font-weight:450}:global(.desk-planner .metric strong small){font-size:11px;letter-spacing:0;color:#849181;margin-left:3px}:global(.desk-planner .metric.recommend){background:#edf2e8;border-radius:6px;padding:12px;grid-column:1/-1;display:flex;align-items:center;justify-content:space-between}:global(.desk-planner .metric.recommend span){margin:0;color:#607455}:global(.desk-planner .metric.recommend strong){font-size:27px;color:#365c3b}:global(.desk-planner .note){font-size:11px;color:#728069;line-height:1.85;margin:14px 0 0}:global(.desk-planner .warning-note){background:#fbf0de;color:#957032;border-left:2px solid #d1a259;padding:9px 11px;border-radius:2px}:global(.desk-planner .detail-actions){display:flex;gap:6px;margin-top:14px}:global(.desk-planner .detail-actions button){flex:1;padding:7px;font-size:11px}:global(.desk-planner .route){color:#768774;font-size:10px;line-height:1.9;margin-top:14px}:global(.desk-planner .meta-row){font-size:11px;margin:12px 0;display:flex;gap:15px;justify-content:space-between;line-height:1.7}:global(.desk-planner .meta-row span){color:#899586;min-width:48px}:global(.desk-planner .meta-row strong){font-weight:400;text-align:right}:global(.desk-planner .footer-note){padding:17px 23px 25px;font-size:10px;line-height:1.9;color:#899386}:global(.desk-planner .footer-note summary){cursor:pointer;color:#65775e;font-size:11px}:global(.desk-planner .footer-note ul){padding-left:16px;margin:10px 0}:global(.desk-planner .export-button){margin-top:13px;font-size:11px;padding:7px 10px}:global(.desk-planner .error){position:absolute;inset:170px 35px auto;background:#fff8e9;padding:20px;line-height:1.8;border:1px solid #dbc891}:global(.desk-planner .compass){position:absolute;bottom:106px;right:28px;color:#8b9d8b;font-size:11px;display:flex;align-items:center;gap:7px}:global(.desk-planner .compass strong){font-size:22px;font-weight:300}:global(.desk-planner .device-note){margin-top:12px;padding:11px 13px;background:#eff3eb;border-radius:5px;font-size:11px;line-height:1.8;color:#6b7d64}:global(.desk-planner .no-results){padding:20px;text-align:center;color:#8a9587;font-size:12px}
@media(min-width:1600px){:global(.desk-planner .workspace){grid-template-columns:minmax(0,1fr) 388px}:global(.desk-planner section){padding:24px 26px}:global(.desk-planner .topbar){left:35px;top:32px}:global(.desk-planner .scene-title h2){font-size:28px}}
@media(max-width:1050px){:global(.desk-planner .workspace){grid-template-columns:minmax(0,1fr) 315px}:global(.desk-planner .header-meta span:nth-child(2)){display:none}:global(.desk-planner .view-tools){max-width:185px}:global(.desk-planner .scene-title h2){font-size:20px}:global(.desk-planner .topbar){left:20px;right:18px}:global(.desk-planner .hint){display:none}:global(.desk-planner section){padding:18px}:global(.desk-planner .tabs){padding:0 18px}:global(.desk-planner .scene-title p){max-width:160px}:global(.desk-planner .float-badge){top:145px;left:20px}:global(.desk-planner .legend){max-width:250px;gap:9px 12px}}
@media(max-width:720px){:global(.desk-planner header){height:70px;padding:0 16px}:global(.desk-planner .header-meta){display:none}:global(.desk-planner h1){font-size:17px}:global(.desk-planner .workspace){display:flex;flex-direction:column;height:auto;min-height:0}:global(.desk-planner main){height:65dvh;min-height:460px}:global(.desk-planner aside){border-left:0;border-top:1px solid var(--line);overflow:visible}:global(.desk-planner .scene-title h2){font-size:20px}:global(.desk-planner .scene-title p){font-size:11px}:global(.desk-planner .topbar){top:18px}:global(.desk-planner .view-tools){max-width:180px;gap:5px}:global(.desk-planner .view-tools button){font-size:11px;padding:7px}:global(.desk-planner .float-badge){top:142px;font-size:10px}:global(.desk-planner .scene-bottom){left:20px;bottom:16px}:global(.desk-planner .scale-note){display:none}:global(.desk-planner .compass){bottom:70px}:global(.desk-planner .legend){max-width:340px;font-size:10px}:global(.desk-planner .metrics){grid-template-columns:1fr 1fr 1fr}:global(.desk-planner .metric.recommend){grid-column:auto;display:block;padding:0;background:transparent}:global(.desk-planner .metric.recommend span){margin-bottom:4px}:global(.desk-planner .metric.recommend strong){font-size:23px}:global(.desk-planner .overview-numbers){margin-top:12px}:global(.desk-planner .setting-row select){max-width:190px}}:global(.desk-planner .focused .scene-title){visibility:hidden}:global(.desk-planner .focused .float-badge){top:24px;max-width:45%}@media(max-width:420px){:global(.desk-planner .topbar){flex-direction:column;gap:13px}:global(.desk-planner .scene-title .eyebrow),:global(.desk-planner .scene-title p){display:none}:global(.desk-planner .scene-title h2){font-size:18px}:global(.desk-planner .view-tools){max-width:none;justify-content:flex-start}:global(.desk-planner .float-badge){top:130px}:global(.desk-planner .focused .float-badge){top:20px;max-width:85%}:global(.desk-planner .focused .scene-title){height:20px}:global(.desk-planner .legend){gap:8px 10px}:global(.desk-planner .metrics){grid-template-columns:1fr 1fr}:global(.desk-planner .metric.recommend){grid-column:1/-1;display:flex;justify-content:space-between;background:#edf2e8;padding:10px}:global(.desk-planner .brand){gap:10px}:global(.desk-planner .eyebrow){letter-spacing:1.6px}}:global(.desk-planner .zone-controls){display:flex;flex-wrap:wrap;gap:6px;padding:15px 23px 0}:global(.desk-planner .zone-controls[hidden]){display:none}:global(.desk-planner .zone-controls button){font-size:11px;padding:7px 9px}:global(.desk-planner .zone-controls button span){margin-left:5px;opacity:.7;font-variant-numeric:tabular-nums}:global(.desk-planner .cable-group){margin-top:16px}:global(.desk-planner .cable-group h3){display:flex;justify-content:space-between;align-items:center;margin:0;padding:8px 10px 3px;font-size:12px;font-weight:600;color:#315f49;border-top:1px solid var(--line)}:global(.desk-planner .cable-group h3 span){font-size:10px;font-weight:400;color:var(--muted)}:global(.desk-planner .cable-group>p){margin:0;padding:0 10px 8px;font-size:10px;line-height:1.7;color:var(--muted)}

:global(.desk-planner){container-type:inline-size;container-name:desk-planner;border:1px solid #dde3dc;border-radius:12px;overflow:hidden;max-width:100%;min-width:0;isolation:isolate}
:global(.desk-planner .persistence){display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 16px;background:#f2f5ec;border-bottom:1px solid #dde3dc;font-size:12px;line-height:1.6}
:global(.desk-planner .application.pending){display:none}
:global(.desk-planner .workspace){height:800px;max-height:90dvh;min-height:620px}
:global(.desk-planner .zone-controls){flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px}
:global(.desk-planner .zone-controls button){flex-shrink:0}
:global(.desk-planner h1),:global(.desk-planner h2),:global(.desk-planner h3){line-height:1.4}
:global(.desk-planner canvas){max-width:100%}
@container desk-planner (max-width:900px){
  :global(.desk-planner .workspace){display:flex;flex-direction:column;height:auto;max-height:none;min-height:0}
  :global(.desk-planner main){height:520px;min-height:460px}
  :global(.desk-planner aside){border-left:0;border-top:1px solid var(--line);overflow:visible}
  :global(.desk-planner header){height:auto;min-height:78px;padding:16px;flex-wrap:wrap}
  :global(.desk-planner .header-meta){display:flex}
  :global(.desk-planner .header-meta span){display:none}
  :global(.desk-planner .topbar){left:18px;right:18px;top:18px}
  :global(.desk-planner .scene-title h2){font-size:20px}
  :global(.desk-planner .scene-title p){font-size:11px;max-width:160px}
  :global(.desk-planner .view-tools){max-width:230px;gap:5px}
  :global(.desk-planner .view-tools button){font-size:11px;padding:7px}
  :global(.desk-planner .hint){display:none}
  :global(.desk-planner .focused .float-badge){max-width:45%}
  :global(.desk-planner .metrics){grid-template-columns:1fr 1fr 1fr}
  :global(.desk-planner .metric.recommend){grid-column:auto;display:block}
}
@container desk-planner (max-width:480px){
  :global(.desk-planner main){height:470px}
  :global(.desk-planner .topbar){flex-direction:column;gap:10px}
  :global(.desk-planner .scene-title .eyebrow),:global(.desk-planner .scene-title p){display:none}
  :global(.desk-planner .view-tools){max-width:none;justify-content:flex-start}
  :global(.desk-planner .float-badge){top:135px;left:18px;font-size:10px}
  :global(.desk-planner .focused .float-badge){top:18px;max-width:85%}
  :global(.desk-planner .focused .scene-title){height:20px}
  :global(.desk-planner .scale-note){display:none}
  :global(.desk-planner .scene-bottom){left:18px;right:18px;bottom:16px}
  :global(.desk-planner .legend){font-size:10px;gap:8px 10px}
  :global(.desk-planner .compass){bottom:70px}
  :global(.desk-planner section){padding:18px}
  :global(.desk-planner .header-meta){width:100%}
}
@media(prefers-reduced-motion:reduce){:global(.desk-planner *){transition:none!important;scroll-behavior:auto!important}}

</style>
