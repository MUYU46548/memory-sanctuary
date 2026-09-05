# -*- coding: utf-8 -*-
"""
merge_fragments.py — 地表碎片 + 机器人碎片内容合并脚本
1. 追加 56 条新归档条目到 data/archives.json
2. 追加 6 个新机器人专属勘探点到 data/explorations.json
3. 给现有 28 个勘探点补充 fragments 引用
4. 校验：ID 唯一 / fragmentFrom 双向引用 / 概率链合计 = 1.0 / 窗口合法
"""
import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DATA_DIR = 'data'

def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)

def dump(p, obj):
    raw_orig = open(p, encoding='utf-8').read()
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        if raw_orig.endswith('\n'):
            f.write('\n')

# ---------- 0. 先验证 round-trip 无损（防止整体重排产生噪音 diff） ----------
for probe in ('archives.json', 'explorations.json'):
    raw = open(f'{DATA_DIR}/{probe}', encoding='utf-8').read()
    obj = load(f'{DATA_DIR}/{probe}')
    import io as _io
    buf = _io.StringIO()
    json.dump(obj, buf, ensure_ascii=False, indent=2)
    buf.write('\n')
    if buf.getvalue() != raw:
        print(f'[警告] {probe} 无法 round-trip 无损，合并将重排整个文件')
    else:
        print(f'[OK] {probe} round-trip 无损')

# ---------- 1. 归档条目 ----------
archives = load(f'{DATA_DIR}/archives.json')
existing_ids = {a['id'] for a in archives['archives']}

new_entries = load('scripts/fragment_archives.json')
new_ids = [e['id'] for e in new_entries]
assert len(new_ids) == len(set(new_ids)), '新条目 ID 重复'
dups = [i for i in new_ids if i in existing_ids]
assert not dups, f'与现有条目 ID 冲突: {dups}'

# 校验 fragmentFrom 引用目标勘探点存在（先并入新勘探点再校验）
new_points = load('scripts/bot_explorations.json')
exp_ids = {p['id'] for p in load(f'{DATA_DIR}/explorations.json')['explorations']} | {p['id'] for p in new_points}
for e in new_entries:
    if e.get('fragmentFrom'):
        assert e['fragmentFrom'] in exp_ids, f"{e['id']} 引用不存在的勘探点 {e['fragmentFrom']}"
    # 窗口合法性
    if e.get('availableAfter') and e.get('expiresAfter'):
        assert e['availableAfter'] < e['expiresAfter'], f"{e['id']} 窗口非法"
    if e.get('botPassive'):
        assert e.get('discoveryMethod') == 'bot_passive', f"{e['id']} botPassive 与 discoveryMethod 不一致"

archives['archives'].extend(new_entries)
dump(f'{DATA_DIR}/archives.json', archives)
print(f'[OK] archives.json: {len(existing_ids)} -> {len(archives["archives"])} 条 (+{len(new_entries)})')

# ---------- 2. 勘探点 ----------
explorations = load(f'{DATA_DIR}/explorations.json')
pts = explorations['explorations']
existing_exp_ids = {p['id'] for p in pts}

# 2a. 现有 28 点补 fragments（映射表）
FRAGMENT_MAP = {
    'exp_ruins_01': ['arch_sf_ruins_01'],
    'exp_forest_02': ['arch_sf_forest_02'],
    'exp_observatory_03': ['arch_sf_obs_03a', 'arch_sf_obs_03b'],
    'exp_abandoned_orchard_04': ['arch_sf_orchard_04'],
    'exp_life_support_04': ['arch_sf_lifesupport_04'],
    'exp_library_05': ['arch_sf_library_05'],
    'exp_factory_06': ['arch_sf_factory_06a', 'arch_sf_factory_06b'],
    'exp_temple_07': ['arch_sf_temple_07'],
    'exp_suburb_08': ['arch_sf_suburb_08'],
    'exp_reactor_09': ['arch_sf_reactor_09a', 'arch_sf_reactor_09b'],
    'exp_crypt_10': ['arch_sf_crypt_10a', 'arch_sf_crypt_10b'],
    'exp_shipyard_11': ['arch_sf_shipyard_11a', 'arch_sf_shipyard_11b'],
    'exp_memorial_12': ['arch_sf_memorial_12'],
    'exp_underground_mushroom_15': ['arch_sf_mushroom_15a', 'arch_sf_mushroom_15b'],
    'exp_opera_ruins_15': ['arch_sf_opera_15'],
    'exp_language_tower_18': ['arch_sf_langtower_18'],
    'exp_hibernation_vault_18': ['arch_sf_hibernation_18'],
    'exp_gray_ocean_21': ['arch_sf_ocean_21a', 'arch_sf_ocean_21b'],
    'exp_legal_archive_22': ['arch_sf_legal_22'],
    'exp_dust_village_25': ['arch_sf_village_25'],
    'exp_ritual_site_26': ['arch_sf_ritual_26a', 'arch_sf_ritual_26b'],
    'exp_plague_clinic_29': ['arch_sf_clinic_29a', 'arch_sf_clinic_29b'],
    'exp_riot_zone_33': ['arch_sf_riot_33a', 'arch_sf_riot_33b'],
    'exp_ruins_final_37': ['arch_sf_final_37'],
    'exp_greenhouse_ruins_37': ['arch_sf_greenhouse_37'],
    'exp_sanctuary_core_41': ['arch_sf_core_41'],
    'exp_bot_depot': ['arch_bf_depot_01'],
    'exp_bot_reactor_core': ['arch_bf_reactor_01', 'arch_bf_reactor_02'],
}
for p in pts:
    if p['id'] in FRAGMENT_MAP:
        p['fragments'] = FRAGMENT_MAP[p['id']]
missing_map = [k for k in FRAGMENT_MAP if k not in existing_exp_ids]
assert not missing_map, f'映射表中勘探点不存在: {missing_map}'

# 2b. 追加 6 个新机器人勘探点
for p in new_points:
    assert p['id'] not in existing_exp_ids, f'勘探点重复: {p["id"]}'
    assert p.get('botOnly'), f'{p["id"]} 必须 botOnly'
    assert p.get('requiredBots', 0) >= 1, f'{p["id"]} 必须 requiredBots>=1'
pts.extend(new_points)

# 2c. 概率链校验（全部点）
prob_errors = []
for p in pts:
    total = round(sum(o.get('probability', 0) for o in p['outcomes']), 6)
    if abs(total - 1.0) > 1e-6:
        prob_errors.append((p['id'], total))
    for o in p['outcomes']:
        if o['type'] == 'resource' and not o.get('message'):
            prob_errors.append((p['id'], 'resource 缺 message'))
assert not prob_errors, f'概率链/字段错误: {prob_errors}'

dump(f'{DATA_DIR}/explorations.json', explorations)
print(f'[OK] explorations.json: {len(existing_exp_ids)} -> {len(pts)} 个点 (+{len(new_points)})')

# ---------- 3. 最终校验：fragments 引用全部存在 ----------
arch_ids = {a['id'] for a in archives['archives']}
bad_refs = []
for p in pts:
    for fid in p.get('fragments', []):
        if fid not in arch_ids:
            bad_refs.append((p['id'], fid))
assert not bad_refs, f'fragments 引用缺失: {bad_refs}'

# 每个 fragmentFrom 都有对应勘探点 fragments 包含它（反向校验）
for e in archives['archives']:
    if e.get('fragmentFrom'):
        src = next((p for p in pts if p['id'] == e['fragmentFrom']), None)
        assert src, f'{e["id"]} 找不到勘探点 {e["fragmentFrom"]}'
        assert e['id'] in (src.get('fragments') or []), f'{e["id"]} 未被 {e["fragmentFrom"]} 的 fragments 引用'

print('[OK] 双向引用校验通过')
print(f'[汇总] 归档条目 {len(arch_ids)} · 勘探点 {len(pts)} · 碎片条目 {len(new_entries)}')
