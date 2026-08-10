/**
 * game-projects.js - 从 game.js 拆分的模块
 * 包含: initProjects, getProjectById, canStartProject...
 */

function initProjects() {
    if (!MemorySanctuary.state) return;
    if (!MemorySanctuary.state.activeProjects) MemorySanctuary.state.activeProjects = [];
    if (!MemorySanctuary.state.completedProjects) MemorySanctuary.state.completedProjects = [];
}


function getProjectById(projectId) {
    if (!MemorySanctuary.data.projects) return null;
    return MemorySanctuary.data.projects.find(p => p.id === projectId) || null;
}


function canStartProject(project) {
    if (!project) return false;
    const state = MemorySanctuary.state;
    const week = state.week;

    // Check if available
    if (project.availableAfter && week < project.availableAfter) return false;

    // Check if already active
    if (state.activeProjects.some(p => p.id === project.id)) return false;

    // Check if already completed (and not repeatable)
    if (!project.repeatable && state.completedProjects.includes(project.id)) return false;

    // Check if we have enough resources
    if (project.cost) {
        if (project.cost.energy && state.resources.energy < project.cost.energy) return false;
        if (project.cost.media && state.resources.media < project.cost.media) return false;
        if (project.cost.environment && state.resources.environment < project.cost.environment) return false;
        if (project.cost.food && state.resources.food < project.cost.food) return false;
    }

    return true;
}


function startProject(projectId) {
    const project = getProjectById(projectId);
    if (!project || !canStartProject(project)) return false;

    const state = MemorySanctuary.state;

    // Deduct cost
    if (project.cost) {
        if (project.cost.energy) state.resources.energy -= project.cost.energy;
        if (project.cost.media) state.resources.media -= project.cost.media;
        if (project.cost.environment) state.resources.environment -= project.cost.environment;
        if (project.cost.food) state.resources.food -= project.cost.food;
    }

    // Add to active projects
    state.activeProjects.push({
        id: project.id,
        remainingWeeks: project.duration,
        effect: project.effect
    });

    addLog(`开始项目：${project.name}`, 'system');
    renderAll();
    if (typeof checkStuckState === 'function') checkStuckState();
    return true;
}


function processActiveProjects() {
    const state = MemorySanctuary.state;
    if (!state.activeProjects || state.activeProjects.length === 0) return;

    const stillActive = [];

    for (const active of state.activeProjects) {
        const project = getProjectById(active.id);
        if (!project) continue;

        active.remainingWeeks--;

        if (active.remainingWeeks <= 0) {
            // Project completed
            state.completedProjects.push(active.id);
            applyProjectEffect(project, true);
            addLog(`项目完成：${project.name}`, 'success');
            if (typeof AudioSystem !== 'undefined' && AudioSystem.playProjectComplete) {
                AudioSystem.playProjectComplete();
            }
        } else {
            // Project still active, apply ongoing effect
            applyProjectEffect(project, false);
            stillActive.push(active);
        }
    }

    state.activeProjects = stillActive;
}


function applyProjectEffect(project, isCompletion) {
    const state = MemorySanctuary.state;
    const effect = project.effect;
    if (!effect) return;

    switch (effect.type) {
        case 'resourceBoost':
            if (!isCompletion && effect.amount) {
                const cap = effect.resource === 'media' ? 150 : (effect.resource === 'food' ? 80 : 150);
                const before = state.resources[effect.resource];
                state.resources[effect.resource] = Math.min(
                    cap,
                    state.resources[effect.resource] + effect.amount
                );
                const actualGain = state.resources[effect.resource] - before;
                state.resourceChanges[effect.resource] = (state.resourceChanges[effect.resource] || 0) + actualGain;
            }
            break;
        case 'foodBoost':
            if (!isCompletion && effect.amount) {
                const before = state.resources.food;
                state.resources.food = Math.min(80, state.resources.food + effect.amount);
                const actualGain = state.resources.food - before;
                state.resourceChanges.food = (state.resourceChanges.food || 0) + actualGain;
            }
            break;
        case 'decayReduction':
            // Applied in getWeeklyDecay
            break;
        case 'unlockArchives':
            if (isCompletion && effect.archiveIds) {
                effect.archiveIds.forEach(archiveId => {
                    const archive = getArchiveById(archiveId);
                    if (archive) {
                        // Make sure it's available
                        archive.availableAfter = Math.min(archive.availableAfter || 999, state.week);
                    }
                });
            }
            break;
    }

    // Guardian bonus
    if (project.guardianBonus) {
        const guardianId = project.guardianBonus.guardian;
        const requiredMood = project.guardianBonus.mood;
        const currentMood = getMoodLevel(guardianId);

        if (currentMood >= requiredMood) {
            // Apply bonus
            if (project.guardianBonus.durationBonus) {
                // Extend duration by adding to remaining weeks
                const active = state.activeProjects.find(p => p.id === project.id);
                if (active) {
                    active.remainingWeeks += project.guardianBonus.durationBonus;
                }
            }
            if (project.guardianBonus.extraEffect === 'environmentBoost') {
                state.resources.environment = Math.min(100, state.resources.environment + 3);
            }
        }
    }
}


function openProjectPanel() {
    const overlay = document.getElementById('project-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        // Force transition reflow
        overlay.offsetHeight;
        renderProjectList();
        if (typeof AudioSystem !== 'undefined') AudioSystem.playMechanicalEngage();
    }
}


function closeProjectPanel() {
    const overlay = document.getElementById('project-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}
