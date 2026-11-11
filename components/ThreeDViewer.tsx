import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box, UploadCloud, Trash2, Loader2, Info, X, RefreshCw, CheckCircle2 } from 'lucide-react';
import { BatchUploadResult, BuildingConfig, MaterialEntry, MemberClass, Project, UploadMode, User } from '../types';
import { isCoupler } from './CouplerSummary';
import type { SabBody, SabModel, SabProgress } from '../utils/sabParser';
import { StoredModelMeta, LoadedModel, listModels, saveModelParts, loadModel, deleteModel } from '../utils/modelStorage';
import type { ModelMember, RebarCsvResult } from '../utils/rebarCsv';
import { buildDesignEntries } from '../utils/modelQuantities';
import {
    modelBodyCompareFloor, modelFloorName, isHorizontalModelType, modelBodyClass,
    buildingFromModelFloors, sameBuildingName, roofFloorsOf, floorLabel as labelFloor
} from '../utils/floorBasis';

interface ThreeDViewerProps {
    currentProject: Project;
    user: User;
    materials: MaterialEntry[];
    onBatchAddMaterials: (entries: MaterialEntry[], mode: UploadMode) => BatchUploadResult;
    onUpdateProject: (project: Project) => void;
}

// 동 선택에서 '모델에서 새 동 추가'
const NEW_DONG = '__new__';

interface FloorProgress {
    planned: number; // kg
    shop: number;    // kg
}

// 한 층의 물량을 수평재 / 수직재 / 구분 없음으로 나눠 둔다
interface FloorSplit {
    H: FloorProgress;
    V: FloorProgress;
    none: FloorProgress;
    all: FloorProgress;
}

const hasAmount = (p: FloorProgress) => p.planned > 0 || p.shop > 0;

// 구분 없는 물량이 섞인 층은 수평/수직으로 나눌 수 없어 층 전체 진척을 쓴다
const progressOf = (split: FloorSplit | undefined, cls: MemberClass): { p: FloorProgress | undefined; merged: boolean } => {
    if (!split) return { p: undefined, merged: false };
    return hasAmount(split.none) ? { p: split.all, merged: true } : { p: split[cls], merged: false };
};

type ClassFilter = 'all' | MemberClass;

type Busy = { label: string; ratio?: number } | null;

// --- 진척 색 ---
const COLOR_NO_DATA = '#e2e8f0';    // 실행·SHOP 물량 모두 없음
const COLOR_NOT_STARTED = '#94a3b8'; // 실행만 있음 (0%)
const COLOR_OVER = '#ef4444';        // 실행 초과
const COLOR_SHOP_ONLY = '#a855f7';   // 실행 없이 SHOP만 있음
const COLOR_DIM = '#f1f5f9';         // 층을 골랐을 때 나머지 층
const PROGRESS_STOPS = ['#fbbf24', '#a3e635', '#16a34a']; // 0% → 50% → 100%

function progressColor(p: FloorProgress | undefined): string {
    if (!p || (p.planned <= 0 && p.shop <= 0)) return COLOR_NO_DATA;
    if (p.planned <= 0) return COLOR_SHOP_ONLY;
    const r = p.shop / p.planned;
    if (r <= 0) return COLOR_NOT_STARTED;
    if (r > 1.05) return COLOR_OVER;
    if (r >= 0.995) return PROGRESS_STOPS[2];
    const c = new THREE.Color(PROGRESS_STOPS[0]);
    return r < 0.5
        ? '#' + c.lerp(new THREE.Color(PROGRESS_STOPS[1]), r / 0.5).getHexString()
        : '#' + new THREE.Color(PROGRESS_STOPS[1]).lerp(new THREE.Color(PROGRESS_STOPS[2]), (r - 0.5) / 0.5).getHexString();
}

const floorOrder = (f: string) => (f.startsWith('B') ? -parseInt(f.slice(1)) : parseInt(f));
const toTon = (kg: number) => (kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });
const percent = (p: FloorProgress | undefined) =>
    p && p.planned > 0 ? `${Math.round((p.shop / p.planned) * 100)}%` : p && p.shop > 0 ? 'SHOP만' : '-';

const TYPE_LABELS: Record<string, string> = {
    Slab: '슬래브', Beam: '보', Wall: '벽체', Column: '기둥', Stair: '계단', LowWall: '난간벽',
    RWall: '옹벽', Pit: 'PIT', IsoFoot: '독립기초'
};

// 변환한 모델을 화면에 그리는 three.js 장면
interface Scene3D {
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    mesh: THREE.Mesh;
    colors: THREE.BufferAttribute;
    dispose: () => void;
}

export const ThreeDViewer: React.FC<ThreeDViewerProps> = ({ currentProject, user, materials, onBatchAddMaterials, onUpdateProject }) => {
    const userRole = currentProject.members.find(m => m.userId === user.email)?.role || 'Guest';
    const canEdit = userRole === 'Admin' || userRole === 'Participant';

    const [models, setModels] = useState<StoredModelMeta[]>([]);
    const [selectedDong, setSelectedDong] = useState(currentProject.buildings[0]?.name ?? NEW_DONG);
    const [model, setModel] = useState<LoadedModel | null>(null);
    const [busy, setBusy] = useState<Busy>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
    const [classFilter, setClassFilter] = useState<ClassFilter>('all');
    const [picked, setPicked] = useState<SabBody | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<Scene3D | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const building = currentProject.buildings.find(b => b.name === selectedDong);
    const storedModel = models.find(m => m.dong === selectedDong);

    const refreshModels = () => listModels(currentProject.id).then(setModels).catch(() => setModels([]));
    useEffect(() => { refreshModels(); }, [currentProject.id]);

    // 선택한 동의 저장된 모델을 불러온다
    useEffect(() => {
        setModel(null);
        setPicked(null);
        setSelectedFloor(null);
        if (!selectedDong || selectedDong === NEW_DONG) return;
        let cancelled = false;
        setBusy({ label: '저장된 모델 불러오는 중' });
        loadModel(currentProject.id, selectedDong)
            .then(m => { if (!cancelled) setModel(m); })
            .catch(e => { if (!cancelled) setError(`모델을 불러오지 못했습니다: ${e.message}`); })
            .finally(() => { if (!cancelled) setBusy(null); });
        return () => { cancelled = true; };
    }, [currentProject.id, selectedDong]);

    // 층별·수평/수직별 실행·SHOP 철근 물량 (커플러 제외, 업로드할 때 이미 SHOP 층 기준으로 맞춰져 있다)
    const progressByFloor = useMemo(() => {
        const map = new Map<string, FloorSplit>();
        const empty = () => ({ planned: 0, shop: 0 });
        materials
            .filter(m => m.projectId === currentProject.id && m.dong === selectedDong && !isCoupler(m))
            .forEach(m => {
                const split = map.get(m.floor) ?? { H: empty(), V: empty(), none: empty(), all: empty() };
                const isShop = (m.dataSource ?? 'Design') === 'Shop';
                const kg = (isShop ? m.shopWeight : m.plannedWeight) || 0;
                for (const p of [split[m.memberClass ?? 'none'], split.all]) {
                    if (isShop) p.shop += kg; else p.planned += kg;
                }
                map.set(m.floor, split);
            });
        return map;
    }, [materials, currentProject.id, selectedDong]);

    // 부재마다 비교할 층 (실행 n형 → SHOP 기준)과 수평/수직
    const bodyFloors = useMemo(() => {
        if (!model || !building) return [];
        return model.bodies.map(b => modelBodyCompareFloor(b.type, b.floor, building));
    }, [model, building]);
    const memberById = useMemo(() => new Map((model?.members ?? []).map(m => [m.msId, m])), [model]);
    const bodyClasses = useMemo(() => model?.bodies.map(b => modelBodyClass(b.type)) ?? [], [model]);

    const floorList = useMemo(() => {
        const set = new Set<string>(progressByFloor.keys());
        bodyFloors.forEach(f => set.add(f));
        return Array.from(set).sort((a, b) => floorOrder(b) - floorOrder(a));
    }, [progressByFloor, bodyFloors]);

    const total = useMemo(() => {
        const sum = (key: keyof FloorSplit) => {
            const t = { planned: 0, shop: 0 };
            progressByFloor.forEach(s => { t.planned += s[key].planned; t.shop += s[key].shop; });
            return t;
        };
        return { all: sum('all'), H: sum('H'), V: sum('V'), none: sum('none') };
    }, [progressByFloor]);

    // 장면 만들기 (모델이 바뀔 때)
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !model || model.bodies.length === 0) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0xf8fafc);
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 1.6));
        const sun = new THREE.DirectionalLight(0xffffff, 1.4);
        sun.position.set(1, -1.5, 2);
        scene.add(sun);
        const fill = new THREE.DirectionalLight(0xffffff, 0.5);
        fill.position.set(-1, 1, 0.5);
        scene.add(fill);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(model.positions, 3));
        geometry.computeVertexNormals(); // 면마다 꼭짓점이 따로라 평면 음영이 된다
        const colors = new THREE.BufferAttribute(new Float32Array(model.positions.length), 3);
        geometry.setAttribute('color', colors);
        geometry.computeBoundingBox();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
        scene.add(mesh);

        // 빌더허브 좌표는 Z가 위
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
        camera.up.set(0, 0, 1);
        const box = geometry.boundingBox!;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3()).length();
        camera.position.set(center.x + size * 0.8, center.y - size * 0.9, center.z + size * 0.5);
        camera.near = size / 1000;
        camera.far = size * 20;
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(center);
        controls.enableDamping = true;
        controls.update();

        const resize = () => {
            const { clientWidth: w, clientHeight: h } = container;
            renderer.setSize(w, h);
            camera.aspect = w / Math.max(h, 1);
            camera.updateProjectionMatrix();
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(container);

        let frame = 0;
        const loop = () => {
            frame = requestAnimationFrame(loop);
            controls.update();
            renderer.render(scene, camera);
        };
        loop();

        sceneRef.current = {
            renderer, camera, controls, mesh, colors,
            dispose: () => {
                cancelAnimationFrame(frame);
                observer.disconnect();
                controls.dispose();
                geometry.dispose();
                (mesh.material as THREE.Material).dispose();
                renderer.dispose();
                renderer.domElement.remove();
            }
        };
        return () => {
            sceneRef.current?.dispose();
            sceneRef.current = null;
        };
    }, [model]);

    // 부재 색칠 (진척 또는 선택한 층이 바뀔 때)
    useEffect(() => {
        const s = sceneRef.current;
        if (!s || !model) return;
        const arr = s.colors.array as Float32Array;
        const cache = new Map<string, THREE.Color>();
        const colorOf = (floor: string, cls: MemberClass) => {
            const dim = (selectedFloor && floor !== selectedFloor) || (classFilter !== 'all' && cls !== classFilter);
            const hex = dim ? COLOR_DIM : progressColor(progressOf(progressByFloor.get(floor), cls).p);
            let c = cache.get(hex);
            if (!c) { c = new THREE.Color(hex); cache.set(hex, c); }
            return c;
        };
        model.bodies.forEach((b, i) => {
            const c = colorOf(bodyFloors[i], bodyClasses[i]);
            for (let v = b.v0; v < b.v0 + b.vn; v++) {
                arr[v * 3] = c.r; arr[v * 3 + 1] = c.g; arr[v * 3 + 2] = c.b;
            }
        });
        s.colors.needsUpdate = true;
    }, [model, bodyFloors, bodyClasses, progressByFloor, selectedFloor, classFilter]);

    // 부재 클릭 → 정보 표시 (드래그로 돌린 경우는 무시)
    useEffect(() => {
        const s = sceneRef.current;
        if (!s || !model) return;
        const el = s.renderer.domElement;
        let down: { x: number; y: number } | null = null;
        const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
        const onUp = (e: PointerEvent) => {
            if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
            const rect = el.getBoundingClientRect();
            const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
            const ray = new THREE.Raycaster();
            ray.setFromCamera(ndc, s.camera);
            const hit = ray.intersectObject(s.mesh)[0];
            if (!hit || hit.faceIndex == null) { setPicked(null); return; }
            const vertex = hit.faceIndex * 3;
            // 부재는 꼭짓점 순서대로 저장돼 있어 이분 탐색으로 찾는다
            let lo = 0, hi = model.bodies.length - 1;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (model.bodies[mid].v0 <= vertex) lo = mid; else hi = mid - 1;
            }
            setPicked(model.bodies[lo]);
        };
        el.addEventListener('pointerdown', onDown);
        el.addEventListener('pointerup', onUp);
        return () => {
            el.removeEventListener('pointerdown', onDown);
            el.removeEventListener('pointerup', onUp);
        };
    }, [model]);

    // 모델의 부재별 실행 물량으로 이 동의 실행 물량을 교체한다 (확인 후)
    const applyModelQuantities = (members: ModelMember[], building: BuildingConfig | undefined) => {
        if (!building) return;
        const r = buildDesignEntries(members, building, currentProject.id);
        if (r.entries.length === 0) {
            setError('모델 물량에서 반영할 실행 물량을 찾지 못했습니다. 기준 설정의 층수를 확인하세요.');
            return;
        }
        const existing = materials.filter(m =>
            m.projectId === currentProject.id && m.dong === building.name && (m.dataSource ?? 'Design') === 'Design'
        ).length;
        const fmt = (t: number, e: number) => [t > 0 ? `${t.toFixed(2)} t` : '', e > 0 ? `커플러 ${Math.round(e).toLocaleString()}개` : ''].filter(Boolean).join(' / ');
        const skippedInfo = r.skipped.length
            ? `\n\n[반영하지 않는 물량]\n${r.skipped.map(s => `- ${s.reason}: ${fmt(s.ton, s.ea)}`).join('\n')}`
            : '';
        const ok = confirm(
            `${building.name} 실행 물량을 모델 물량으로 교체할까요?\n\n` +
            `- 철근 ${r.ton.toFixed(1)} t (그중 수평재 ${r.shiftedTon.toFixed(1)} t는 한 층 위 SHOP 기준으로)\n` +
            `- 커플러 ${Math.round(r.ea).toLocaleString()}개\n` +
            `- 기존 ${building.name} 실행 물량 ${existing}건은 삭제됩니다. (SHOP 물량은 그대로)` +
            skippedInfo
        );
        if (!ok) return;
        onBatchAddMaterials(r.entries, 'replace');
        setNotice(`${building.name} 실행 물량을 모델 기준으로 반영했습니다: 철근 ${r.ton.toFixed(1)} t, 커플러 ${Math.round(r.ea).toLocaleString()}개`);
    };

    // 모델 물량(CSV·산출서 엑셀)의 동 이름으로 올릴 동을 정한다. 선택한 동이 있으면 그 동, '새 동 추가'면 이름이 같은 동이나 새 동
    const resolveTarget = (info: RebarCsvResult | undefined, fileName: string) => {
        const selected = currentProject.buildings.find(b => b.name === selectedDong);
        const modelName = info?.buildingName || fileName.replace(/\.(sab|csv)$/i, '').replace(/_rebar$/i, '').split('_').pop() || fileName;
        const existing = selected ?? currentProject.buildings.find(b => sameBuildingName(b.name, modelName));
        return { selected, modelName, existing, name: existing?.name ?? modelName };
    };

    // 모델의 동 이름·층 정보를 프로젝트 설정과 맞춘다 (다르면 확인 후 갱신, 없으면 추가).
    // 반영할 동 설정을 돌려주고, 대상 동이 없는데 추가를 취소하면 undefined
    const syncBuildingFromModel = (info: RebarCsvResult, sourceFile: string): BuildingConfig | undefined => {
        const { selected, modelName, existing: target } = resolveTarget(info, sourceFile);
        const fromModel = buildingFromModelFloors(target?.name ?? modelName, info.floors, sourceFile);
        const describe = (b: BuildingConfig) =>
            `지하 ${b.basementFloors}층 / 지상 ${b.groundFloors}층 / 지붕층 ${roofFloorsOf(b).join(', ')}`;

        if (target && describe(target) === describe(fromModel)) {
            if (target.modelFile !== sourceFile) {
                onUpdateProject({ ...currentProject, buildings: currentProject.buildings.map(b => (b === target ? fromModel : b)) });
            }
            return fromModel;
        }
        const nameNote = selected && !sameBuildingName(selected.name, modelName)
            ? `\n\n※ 선택한 동(${selected.name})과 모델의 동 이름(${modelName})이 다릅니다. 동을 다시 확인하세요.`
            : '';
        const ok = confirm(target
            ? `${target.name} 층 정보를 모델 기준으로 바꿀까요?\n\n- 현재 설정: ${describe(target)}\n- 모델: ${describe(fromModel)}${nameNote}\n\n취소하면 현재 설정을 그대로 씁니다.`
            : `모델의 동 '${modelName}'이(가) 프로젝트 설정에 없습니다. 새 동으로 추가할까요?\n\n- ${describe(fromModel)}`);
        if (!ok) return target;
        onUpdateProject({
            ...currentProject,
            buildings: target
                ? currentProject.buildings.map(b => (b === target ? fromModel : b))
                : [...currentProject.buildings, fromModel]
        });
        return fromModel;
    };

    // 형상(.sab)과 물량(_rebar.csv 또는 산출서 엑셀)은 함께 올려도, 따로 올려도 된다. 올린 쪽만 바꾸고 다른 쪽은 그대로 둔다.
    const handleFiles = (files: File[]) => {
        if (!selectedDong) return;
        const sab = files.find(f => /\.sab$/i.test(f.name));
        const qtyFiles = files.filter(f => /\.(csv|xlsx?)$/i.test(f.name));
        const csv = qtyFiles.find(f => /rebar/i.test(f.name)) ?? qtyFiles.find(f => /\.xlsx?$/i.test(f.name)) ?? qtyFiles[0];
        if (!sab && !csv) {
            setError('빌더허브 .sab(형상) 파일이나 물량 파일(_rebar.csv 또는 산출서 엑셀)을 골라 주세요.');
            return;
        }
        if (selectedDong === NEW_DONG && !csv) {
            setError('새 동을 모델에서 추가하려면 동 이름과 층 정보가 든 물량 파일(_rebar.csv 또는 산출서 엑셀)을 골라 주세요.');
            return;
        }
        setError('');
        setNotice('');
        setBusy(sab ? { label: '모델 변환 중', ratio: 0 } : { label: '물량 파일 읽는 중' });
        const worker = new Worker(new URL('../utils/sabWorker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = async (e: MessageEvent) => {
            const msg = e.data as ({ type: 'progress'; stage?: 'csv' } & SabProgress)
                | { type: 'done'; model?: SabModel; quantities?: RebarCsvResult }
                | { type: 'error'; message: string };
            if (msg.type === 'progress') {
                setBusy(msg.stage === 'csv'
                    ? { label: '물량 파일 읽는 중' }
                    : { label: `모델 변환 중 (부재 ${msg.bodies.toLocaleString()}개)`, ratio: msg.ratio });
                return;
            }
            worker.terminate();
            setBusy(null);
            if (msg.type === 'error') {
                setError(`읽기 실패: ${msg.message}`);
                return;
            }
            const { model: sabModel, quantities } = msg;
            if (sabModel && sabModel.bodies.length === 0) {
                setError('파일에서 부재를 찾지 못했습니다. 빌더허브 모델의 .sab 파일인지 확인하세요.');
                return;
            }
            const members = quantities?.members;
            if (quantities && members?.length === 0) {
                setError('물량 파일에서 철근 물량을 찾지 못했습니다.');
                return;
            }

            // 1. 이미 올린 정보를 바꾸는지, 형상과 물량이 같은 모델인지 확인한다
            const dest = resolveTarget(quantities, (csv ?? sab)!.name);
            const destMeta = models.find(m => m.dong === dest.name);
            const stored = destMeta ? await loadModel(currentProject.id, dest.name).catch(() => null) : null;
            const replaced = [
                sab && destMeta?.fileName ? `- 모델 형상: ${destMeta.fileName} → ${sab.name}` : '',
                csv && destMeta?.csvFileName ? `- 모델 물량: ${destMeta.csvFileName} → ${csv.name}` : '',
            ].filter(Boolean);
            const finalBodies = sabModel?.bodies ?? stored?.bodies ?? [];
            const finalMembers = members ?? stored?.members ?? [];
            let mismatch = '';
            if (finalBodies.length && finalMembers.length) {
                const ids = new Set(finalBodies.map(b => b.msId));
                const ratio = finalMembers.filter(m => ids.has(m.msId)).length / finalMembers.length;
                if (ratio < 0.5) mismatch = `※ 형상과 물량의 부재 ID가 ${Math.round(ratio * 100)}%만 맞습니다. 서로 다른 모델의 파일일 수 있습니다.`;
            }
            if (replaced.length || mismatch) {
                const ok = confirm(
                    (replaced.length
                        ? `${dest.name}에 이미 올린 정보가 있습니다. 계속하면 아래 기존 정보는 지워지고 새 파일로 바뀝니다.\n\n${replaced.join('\n')}`
                        : `${dest.name} 모델 파일을 확인해 주세요.`) +
                    (mismatch ? `\n\n${mismatch}` : '') +
                    '\n\n계속할까요?'
                );
                if (!ok) return;
            }

            // 2. 물량 파일이 있으면 동 이름·층 정보를 프로젝트 설정에 맞춘다
            const target = quantities ? syncBuildingFromModel(quantities, csv!.name) : building;
            if (!target) {
                setError('모델을 올릴 동이 없어 취소했습니다.');
                return;
            }

            // 3. 올린 쪽만 바꿔 저장한다
            try {
                setBusy({ label: '브라우저에 저장 중' });
                await saveModelParts(currentProject.id, target.name, {
                    sab: sabModel && sab ? { fileName: sab.name, model: sabModel } : undefined,
                    csv: members && csv ? { fileName: csv.name, members } : undefined,
                });
                await refreshModels();
                if (target.name !== selectedDong) setSelectedDong(target.name);
                else setModel({
                    bodies: finalBodies,
                    positions: sabModel?.positions ?? stored?.positions ?? new Float32Array(0),
                    members: finalMembers.length ? finalMembers : undefined
                });
            } catch (err) {
                setError(`저장 실패: ${err instanceof Error ? err.message : String(err)}`);
                return;
            } finally {
                setBusy(null);
            }

            if (!finalMembers.length) setNotice('형상만 올렸습니다. 같은 폴더의 _rebar.csv나 산출서 엑셀을 올리면 실행 물량과 층 정보가 추가됩니다.');
            else if (!finalBodies.length) setNotice('물량만 올렸습니다. 같은 폴더의 .sab를 올리면 3D 형상이 추가됩니다.');

            // 4. 새 물량이면 이 동의 실행 물량을 모델 기준으로 바꿀지 묻는다
            if (members?.length) applyModelQuantities(members, target);
        };
        worker.onerror = e => {
            worker.terminate();
            setBusy(null);
            setError(`읽기 실패: ${e.message}`);
        };
        worker.postMessage({ sab, csv });
    };

    const handleDelete = async () => {
        if (!storedModel || !confirm(`${selectedDong} 모델(형상·모델 물량)을 삭제할까요? (철근 물량 관리에 반영된 물량은 그대로입니다)`)) return;
        await deleteModel(currentProject.id, selectedDong);
        await refreshModels();
        setModel(null);
    };

    const pickedFloor = picked && building ? modelBodyCompareFloor(picked.type, picked.floor, building) : null;
    // 지붕층은 이름을 함께 보여준다 (RF (19F), PHF (20F))
    const floorLabel = (f: string) => labelFloor(building, f);

    return (
        <div className="h-full flex flex-col space-y-4">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Box className="text-blue-600" /> 3D 진척 모델
                    </h2>
                    <p className="text-slate-500 text-sm">빌더허브 실행 모델을 올리면 층별 SHOP 물량 진척률을 색으로 보여줍니다. 슬래브·보는 SHOP 기준 층(한 층 위)으로 비교합니다.</p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={selectedDong}
                        onChange={e => { setSelectedDong(e.target.value); setNotice(''); }}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                        {currentProject.buildings.map(b => (
                            <option key={b.name} value={b.name}>
                                {b.name}{models.some(m => m.dong === b.name) ? ' (모델 있음)' : ''}
                            </option>
                        ))}
                        {canEdit && <option value={NEW_DONG}>+ 모델에서 새 동 추가</option>}
                    </select>
                    {canEdit && (
                        <>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".sab,.csv,.xlsx,.xls"
                                multiple
                                className="hidden"
                                onChange={e => {
                                    const files = Array.from(e.target.files ?? []);
                                    e.target.value = '';
                                    if (files.length) handleFiles(files);
                                }}
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={!!busy || !selectedDong}
                                title="Models 폴더의 .sab(형상)와 물량 파일(_rebar.csv 또는 산출서 엑셀) - 함께 또는 따로"
                                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium whitespace-nowrap hover:bg-blue-700 disabled:opacity-50"
                            >
                                <UploadCloud size={16} /> 모델 올리기 (.sab / 물량 CSV·엑셀)
                            </button>
                            {model?.members?.length ? (
                                <button
                                    onClick={() => applyModelQuantities(model.members!, building)}
                                    disabled={!!busy}
                                    title="저장된 모델 물량으로 이 동의 실행 물량을 다시 반영"
                                    className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium whitespace-nowrap hover:bg-slate-50 disabled:opacity-50"
                                >
                                    <RefreshCw size={14} /> 실행 물량 반영
                                </button>
                            ) : null}
                            {storedModel && (
                                <button
                                    onClick={handleDelete}
                                    disabled={!!busy}
                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                    title="이 동의 모델 삭제"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 flex justify-between items-center">
                    <span>{error}</span>
                    <button onClick={() => setError('')}><X size={14} /></button>
                </div>
            )}

            {notice && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-2 flex justify-between items-center">
                    <span className="flex items-center gap-2"><CheckCircle2 size={14} /> {notice}</span>
                    <button onClick={() => setNotice('')}><X size={14} /></button>
                </div>
            )}

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 min-h-[560px]">
                <div className="relative bg-slate-50 rounded-xl border border-slate-200 overflow-hidden min-h-[420px]">
                    <div ref={containerRef} className="absolute inset-0" />

                    {!model?.bodies.length && !busy && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 text-slate-500">
                            <Box size={40} className="text-slate-300 mb-3" />
                            <p className="font-bold text-slate-700 mb-1">
                                {selectedDong === NEW_DONG
                                    ? '모델을 올리면 동 이름과 층 정보를 읽어 프로젝트 설정에 추가합니다'
                                    : model?.members?.length
                                        ? `${selectedDong} 물량은 올라와 있고, 형상(.sab)이 없습니다`
                                        : `${selectedDong} 모델이 없습니다`}
                            </p>
                            <p className="text-sm max-w-md">
                                빌더허브 프로젝트 폴더의 <span className="font-mono text-xs bg-white px-1 rounded border">이름.rhb.Data/Models</span> 에서
                                <span className="font-mono text-xs bg-white px-1 rounded border">.sab</span>(3D 형상)와 <span className="font-mono text-xs bg-white px-1 rounded border">_rebar.csv</span> 또는 산출서 엑셀(실행 물량·층 정보)을 올려 주세요.
                                함께 올려도, 따로 올려도 됩니다. 변환한 모델은 이 브라우저에만 저장됩니다.
                            </p>
                        </div>
                    )}

                    {busy && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                            <div className="bg-white shadow-lg rounded-xl px-6 py-4 w-72 text-center">
                                <Loader2 className="animate-spin text-blue-600 mx-auto mb-2" />
                                <p className="text-sm font-medium text-slate-700">{busy.label}</p>
                                {busy.ratio !== undefined && (
                                    <div className="h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
                                        <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.round(busy.ratio * 100)}%` }} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {!!model?.bodies.length && (
                        <div className="absolute left-3 bottom-3 bg-white/90 rounded-lg shadow-sm border border-slate-200 px-3 py-2 text-xs text-slate-600 space-y-1">
                            {[
                                [COLOR_NOT_STARTED, '실행만 (0%)'],
                                [PROGRESS_STOPS[0], '진행 중'],
                                [PROGRESS_STOPS[2], '완료 (100%)'],
                                [COLOR_OVER, '실행 초과 (105%↑)'],
                                [COLOR_SHOP_ONLY, 'SHOP만 있음'],
                                [COLOR_NO_DATA, '물량 없음'],
                            ].map(([c, label]) => (
                                <div key={label} className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-sm border border-slate-300" style={{ background: c }} />
                                    {label}
                                </div>
                            ))}
                        </div>
                    )}

                    {picked && (
                        <div className="absolute right-3 top-3 bg-white rounded-lg shadow-md border border-slate-200 px-4 py-3 text-sm w-60">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-slate-800">{TYPE_LABELS[picked.type] ?? picked.type}</span>
                                <button onClick={() => setPicked(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                            </div>
                            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-600">
                                <dt>모델 층</dt><dd>{floorLabel(modelFloorName(picked.floor))}</dd>
                                <dt>비교 층</dt>
                                <dd>{pickedFloor && floorLabel(pickedFloor)}{isHorizontalModelType(picked.type) && pickedFloor !== modelFloorName(picked.floor) ? ' (수평재 한 층 위)' : ''}</dd>
                                <dt>구분</dt><dd>{modelBodyClass(picked.type) === 'H' ? '수평재' : '수직재'}</dd>
                                <dt>진척</dt>
                                <dd className="font-bold">
                                    {(() => {
                                        if (!pickedFloor) return '-';
                                        const { p, merged } = progressOf(progressByFloor.get(pickedFloor), modelBodyClass(picked.type));
                                        return `${percent(p)}${merged ? ' (층 전체)' : ''}`;
                                    })()}
                                </dd>
                                <dt>부재 ID</dt><dd>{picked.msId}</dd>
                            </dl>
                            {(() => {
                                const member = memberById.get(picked.msId);
                                if (!member) return model?.members ? <p className="mt-2 text-[11px] text-slate-400">이 부재에는 실행 철근 물량이 없습니다.</p> : null;
                                const ton = member.items.reduce((a, it) => a + it.ton, 0);
                                const ea = member.items.reduce((a, it) => a + it.ea, 0);
                                return (
                                    <div className="mt-2 pt-2 border-t border-slate-100 text-xs">
                                        <p className="font-bold text-slate-700">{member.name || member.kind}</p>
                                        <p className="text-slate-500 mb-1">실행 철근 {ton.toFixed(3)} t{ea > 0 ? ` · 커플러 ${ea}개` : ''}</p>
                                        <table className="w-full text-slate-600">
                                            <tbody>
                                                {member.items.map(it => (
                                                    <tr key={`${it.dia}|${it.strength}`}>
                                                        <td>D{it.dia} {it.strength}</td>
                                                        <td className="text-right">{it.ton > 0 ? `${(it.ton * 1000).toFixed(1)} kg` : ''}</td>
                                                        <td className="text-right text-violet-600">{it.ea > 0 ? `${it.ea} EA` : ''}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-slate-100">
                        <p className="text-xs text-slate-500">{selectedDong} 전체 철근 진척 (커플러 제외)</p>
                        <p className="text-2xl font-bold text-slate-800">{percent(total.all)}</p>
                        <p className="text-xs text-slate-500">SHOP {toTon(total.all.shop)} t / 실행 {toTon(total.all.planned)} t</p>
                        <p className="text-xs text-slate-600 mt-1">
                            수평 <span className="font-bold">{percent(total.H)}</span> · 수직 <span className="font-bold">{percent(total.V)}</span>
                            {hasAmount(total.none) && <span className="text-amber-600"> · 구분 없음 {toTon(total.none.planned + total.none.shop)} t</span>}
                        </p>
                        {storedModel && (
                            <p className="text-[11px] text-slate-400 mt-2 flex items-start gap-1">
                                <Info size={12} className="mt-0.5 shrink-0" />
                                형상 {storedModel.fileName ? `${storedModel.fileName} (부재 ${storedModel.bodyCount.toLocaleString()}개, ${(storedModel.storedBytes / 1e6).toFixed(1)} MB)` : '없음'} · 물량 {storedModel.csvFileName ?? '없음'} · {new Date(storedModel.uploadedAt).toLocaleDateString()}
                            </p>
                        )}
                    </div>
                    <div className="px-4 py-2 bg-slate-50 space-y-2">
                        <div className="flex bg-white border border-slate-200 p-0.5 rounded-lg text-xs">
                            {([['all', '전체'], ['H', '수평재'], ['V', '수직재']] as [ClassFilter, string][]).map(([key, label]) => (
                                <button
                                    key={key}
                                    onClick={() => setClassFilter(key)}
                                    className={`flex-1 px-2 py-1 rounded-md font-medium ${classFilter === key ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>층을 누르면 그 층만 강조합니다</span>
                            {selectedFloor && <button onClick={() => setSelectedFloor(null)} className="text-blue-600 font-medium">층 선택 해제</button>}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-white text-slate-500">
                                <tr className="border-b border-slate-100">
                                    <th className="text-left px-4 py-2 font-medium">층</th>
                                    <th className="text-right px-2 py-2 font-medium">수평</th>
                                    <th className="text-right px-2 py-2 font-medium">수직</th>
                                    <th className="text-right px-4 py-2 font-medium">전체</th>
                                </tr>
                            </thead>
                            <tbody>
                                {floorList.map(f => {
                                    const split = progressByFloor.get(f);
                                    const cell = (cls: MemberClass) => {
                                        const { p, merged } = progressOf(split, cls);
                                        return (
                                            <td
                                                className="text-right px-2 text-slate-600 whitespace-nowrap"
                                                title={p ? `실행 ${toTon(p.planned)} t / SHOP ${toTon(p.shop)} t` : undefined}
                                            >
                                                <span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle border border-slate-300" style={{ background: progressColor(p) }} />
                                                {merged ? '*' : percent(p)}
                                            </td>
                                        );
                                    };
                                    return (
                                        <tr
                                            key={f}
                                            onClick={() => setSelectedFloor(selectedFloor === f ? null : f)}
                                            className={`border-b border-slate-50 cursor-pointer ${selectedFloor === f ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                                        >
                                            <td className="px-4 py-1.5 font-medium text-slate-700">{floorLabel(f)}</td>
                                            {cell('H')}
                                            {cell('V')}
                                            <td
                                                className="text-right px-4 font-bold text-slate-700"
                                                title={split ? `실행 ${toTon(split.all.planned)} t / SHOP ${toTon(split.all.shop)} t` : undefined}
                                            >
                                                {percent(split?.all)}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {floorList.length === 0 && (
                                    <tr><td colSpan={4} className="text-center text-slate-400 py-8">이 동의 물량이 없습니다</td></tr>
                                )}
                            </tbody>
                        </table>
                        {hasAmount(total.none) && (
                            <p className="px-4 py-2 text-[11px] text-amber-700">
                                * 수평/수직 구분 없이 올라간 물량이 있는 층은 수평·수직을 나눌 수 없어 층 전체 진척으로 칠합니다. 엑셀에 구분을 적어 교체 업로드하면 나눠집니다.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
