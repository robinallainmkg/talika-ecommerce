"use client"

import { useEffect, useState, useCallback, Fragment } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase/client"
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Save,
  X,
  Trash2,
  CornerDownRight,
  CalendarDays,
  User,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────

interface ProjectTask {
  id: string
  project_id: string
  title: string
  description: string | null
  status: "todo" | "in_progress" | "blocked" | "done"
  priority: "low" | "medium" | "high" | "critical"
  assignee: string | null
  due_date: string | null
  sort_order: number
  parent_task_id: string | null
}

interface Project {
  id: string
  name: string
  slug: string
  description: string | null
  status: string
  priority: string
  start_date: string | null
  target_date: string | null
  created_at: string
  project_tasks: ProjectTask[]
}

// ─── Config ──────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "info" | "danger"; icon: typeof Circle }> = {
  not_started: { label: "Non démarré", variant: "default", icon: Circle },
  active: { label: "En cours", variant: "info", icon: Clock },
  in_progress: { label: "En cours", variant: "info", icon: Clock },
  on_hold: { label: "En pause", variant: "warning", icon: AlertTriangle },
  completed: { label: "Terminé", variant: "success", icon: CheckCircle2 },
}

const taskStatusConfig: Record<string, { label: string; icon: typeof Circle; colorClass: string }> = {
  todo: { label: "A faire", icon: Circle, colorClass: "text-zinc-300" },
  in_progress: { label: "En cours", icon: Clock, colorClass: "text-blue-500" },
  blocked: { label: "Bloqué", icon: AlertTriangle, colorClass: "text-red-500" },
  done: { label: "Terminé", icon: CheckCircle2, colorClass: "text-emerald-500" },
}

const priorityConfig: Record<string, { label: string; variant: "default" | "info" | "warning" | "danger" }> = {
  low: { label: "Faible", variant: "default" },
  medium: { label: "Moyen", variant: "info" },
  high: { label: "Haute", variant: "warning" },
  critical: { label: "Critique", variant: "danger" },
}

const ASSIGNEES = ["Robin", "Sophie", "Diane", "Meha", "Bruno"]

// ─── Task Row Component ──────────────────────────────────────

function TaskRow({
  task,
  subtasks,
  depth = 0,
  onUpdate,
  onDelete,
  onAddSubtask,
  onDragStart,
  onDragOver,
  onDrop,
  dragOverId,
  dragOverPosition,
}: {
  task: ProjectTask
  subtasks: ProjectTask[]
  depth?: number
  onUpdate: (id: string, field: string, value: string | null) => void
  onDelete: (id: string) => void
  onAddSubtask: (parentId: string) => void
  onDragStart?: (taskId: string) => void
  onDragOver?: (e: React.DragEvent, taskId: string) => void
  onDrop?: (e: React.DragEvent, taskId: string) => void
  dragOverId?: string | null
  dragOverPosition?: "above" | "below" | "inside" | null
}) {
  const [expanded, setExpanded] = useState(true)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")

  const tc = taskStatusConfig[task.status] || taskStatusConfig.todo
  const TaskIcon = tc.icon
  const hasSubtasks = subtasks.length > 0
  const subtasksDone = subtasks.filter(s => s.status === "done").length

  const cycleStatus = () => {
    const statuses: ProjectTask["status"][] = ["todo", "in_progress", "done"]
    const idx = statuses.indexOf(task.status)
    const next = statuses[(idx + 1) % statuses.length]
    onUpdate(task.id, "status", next)
  }

  const startEdit = (field: string, currentValue: string | null) => {
    setEditingField(field)
    setEditValue(currentValue || "")
  }

  const saveEdit = () => {
    if (editingField) {
      onUpdate(task.id, editingField, editValue || null)
      setEditingField(null)
    }
  }

  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "done"
  const isDropTarget = dragOverId === task.id

  return (
    <Fragment>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move"
          onDragStart?.(task.id)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
          onDragOver?.(e, task.id)
        }}
        onDrop={(e) => {
          e.preventDefault()
          onDrop?.(e, task.id)
        }}
        className={`flex items-center gap-2 rounded-lg border p-2.5 hover:bg-zinc-50 transition-all cursor-grab active:cursor-grabbing ${
          depth > 0 ? "ml-6 border-l-2 border-l-zinc-200" : ""
        } ${task.status === "done" ? "opacity-60" : ""} ${
          isDropTarget && dragOverPosition === "above"
            ? "border-t-2 border-t-blue-500 border-zinc-100"
            : isDropTarget && dragOverPosition === "below"
            ? "border-b-2 border-b-blue-500 border-zinc-100"
            : isDropTarget && dragOverPosition === "inside"
            ? "border-2 border-blue-400 bg-blue-50/50"
            : "border-zinc-100"
        }`}
      >
        {/* Expand toggle (only for tasks with subtasks) */}
        <div className="w-5 flex-shrink-0">
          {hasSubtasks ? (
            <button onClick={() => setExpanded(!expanded)} className="text-zinc-400 hover:text-zinc-600">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : depth > 0 ? (
            <CornerDownRight className="h-3.5 w-3.5 text-zinc-300" />
          ) : null}
        </div>

        {/* Status icon (clickable to cycle) */}
        <button onClick={cycleStatus} className={`flex-shrink-0 ${tc.colorClass} hover:opacity-70`}>
          <TaskIcon className="h-4 w-4" />
        </button>

        {/* Title */}
        {editingField === "title" ? (
          <input
            autoFocus
            className="flex-1 text-sm border-b border-zinc-300 bg-transparent outline-none px-1"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={e => e.key === "Enter" && saveEdit()}
          />
        ) : (
          <span
            className={`flex-1 text-sm cursor-pointer ${
              task.status === "done" ? "text-zinc-400 line-through" : "text-zinc-900"
            }`}
            onClick={() => startEdit("title", task.title)}
          >
            {task.title}
            {hasSubtasks && (
              <span className="ml-2 text-xs text-zinc-400">
                ({subtasksDone}/{subtasks.length})
              </span>
            )}
          </span>
        )}

        {/* Assignee */}
        {editingField === "assignee" ? (
          <select
            autoFocus
            className="text-xs border rounded px-1 py-0.5 bg-white"
            value={editValue}
            onChange={e => { setEditValue(e.target.value); onUpdate(task.id, "assignee", e.target.value || null); setEditingField(null) }}
            onBlur={() => setEditingField(null)}
          >
            <option value="">Non assigné</option>
            {ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        ) : (
          <button
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 min-w-[80px] justify-end"
            onClick={() => startEdit("assignee", task.assignee)}
          >
            <User className="h-3 w-3" />
            {task.assignee || "—"}
          </button>
        )}

        {/* Due date */}
        {editingField === "due_date" ? (
          <input
            autoFocus
            type="date"
            className="text-xs border rounded px-1 py-0.5"
            value={editValue}
            onChange={e => { onUpdate(task.id, "due_date", e.target.value || null); setEditingField(null) }}
            onBlur={() => setEditingField(null)}
          />
        ) : (
          <button
            className={`flex items-center gap-1 text-xs min-w-[90px] justify-end ${
              isOverdue ? "text-red-500 font-medium" : "text-zinc-400 hover:text-zinc-600"
            }`}
            onClick={() => startEdit("due_date", task.due_date)}
          >
            <CalendarDays className="h-3 w-3" />
            {task.due_date ? new Date(task.due_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—"}
          </button>
        )}

        {/* Priority badge */}
        <select
          className="text-[10px] border-0 bg-transparent cursor-pointer appearance-none text-right"
          value={task.priority}
          onChange={e => onUpdate(task.id, "priority", e.target.value)}
        >
          {Object.entries(priorityConfig).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {/* Status badge */}
        <Badge variant={task.status === "blocked" ? "danger" : task.status === "done" ? "success" : "default"} className="text-[10px] min-w-[60px] justify-center">
          {tc.label}
        </Badge>

        {/* Add subtask button */}
        {depth === 0 && (
          <button
            onClick={() => onAddSubtask(task.id)}
            className="text-zinc-300 hover:text-zinc-500"
            title="Ajouter une sous-tâche"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Delete */}
        <button onClick={() => onDelete(task.id)} className="text-zinc-300 hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Subtasks */}
      {expanded && subtasks.map(sub => (
        <TaskRow
          key={sub.id}
          task={sub}
          subtasks={[]}
          depth={depth + 1}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAddSubtask={onAddSubtask}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          dragOverId={dragOverId}
          dragOverPosition={dragOverPosition}
        />
      ))}
    </Fragment>
  )
}

// ─── Page ────────────────────────────────────────────────────

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState<Record<string, string>>({})
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [newSubtaskParent, setNewSubtaskParent] = useState<string | null>(null)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("")
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<"above" | "below" | "inside" | null>(null)

  const fetchProjects = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from("projects")
        .select(`*, project_tasks (*)`)
        .order("created_at", { ascending: false })

      if (err) throw err
      setProjects(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // ─── Task CRUD ─────────────────────────────────────────────

  const updateTask = async (taskId: string, field: string, value: string | null) => {
    const { error: err } = await supabase
      .from("project_tasks")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("id", taskId)

    if (!err) {
      setProjects(prev => prev.map(p => ({
        ...p,
        project_tasks: p.project_tasks.map(t => t.id === taskId ? { ...t, [field]: value } : t),
      })))
    }
  }

  const deleteTask = async (taskId: string) => {
    // Also delete subtasks
    await supabase.from("project_tasks").delete().eq("parent_task_id", taskId)
    const { error: err } = await supabase.from("project_tasks").delete().eq("id", taskId)
    if (!err) {
      setProjects(prev => prev.map(p => ({
        ...p,
        project_tasks: p.project_tasks.filter(t => t.id !== taskId && t.parent_task_id !== taskId),
      })))
    }
  }

  const addTask = async (projectId: string) => {
    const title = newTaskTitle[projectId]?.trim()
    if (!title) return

    const { data, error: err } = await supabase
      .from("project_tasks")
      .insert({ project_id: projectId, title, status: "todo", priority: "medium" })
      .select()
      .single()

    if (!err && data) {
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, project_tasks: [...p.project_tasks, data] } : p
      ))
      setNewTaskTitle(prev => ({ ...prev, [projectId]: "" }))
      setAddingTo(null)
    }
  }

  const addSubtask = async (parentId: string) => {
    const title = newSubtaskTitle.trim()
    if (!title) return

    // Find project_id from parent
    const parentProject = projects.find(p => p.project_tasks.some(t => t.id === parentId))
    if (!parentProject) return

    const { data, error: err } = await supabase
      .from("project_tasks")
      .insert({
        project_id: parentProject.id,
        parent_task_id: parentId,
        title,
        status: "todo",
        priority: "medium",
      })
      .select()
      .single()

    if (!err && data) {
      setProjects(prev => prev.map(p =>
        p.id === parentProject.id ? { ...p, project_tasks: [...p.project_tasks, data] } : p
      ))
      setNewSubtaskParent(null)
      setNewSubtaskTitle("")
    }
  }

  // ─── Drag & Drop ──────────────────────────────────────────

  const handleDragStart = (taskId: string) => {
    setDraggedTaskId(taskId)
  }

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    if (!draggedTaskId || draggedTaskId === targetId) return

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    const height = rect.height

    if (y < height * 0.25) {
      setDragOverPosition("above")
    } else if (y > height * 0.75) {
      setDragOverPosition("below")
    } else {
      setDragOverPosition("inside") // nest as subtask
    }
    setDragOverId(targetId)
  }

  const handleDrop = async (_e: React.DragEvent, targetId: string) => {
    if (!draggedTaskId || draggedTaskId === targetId) {
      resetDrag()
      return
    }

    // Find both tasks across all projects
    let draggedTask: ProjectTask | null = null
    let targetTask: ProjectTask | null = null
    let projectId: string | null = null

    for (const p of projects) {
      for (const t of p.project_tasks) {
        if (t.id === draggedTaskId) { draggedTask = t; projectId = p.id }
        if (t.id === targetId) targetTask = t
      }
    }

    if (!draggedTask || !targetTask || !projectId) {
      resetDrag()
      return
    }

    if (dragOverPosition === "inside") {
      // Make dragged task a subtask of target (only if target is a root task)
      if (!targetTask.parent_task_id) {
        await supabase
          .from("project_tasks")
          .update({ parent_task_id: targetId, updated_at: new Date().toISOString() })
          .eq("id", draggedTaskId)
      }
    } else {
      // Reorder: place above or below target
      const allTasks = projects.find(p => p.id === projectId)?.project_tasks || []
      const sameLevel = allTasks
        .filter(t => t.parent_task_id === targetTask!.parent_task_id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

      // Also update parent_task_id if moving between levels
      const newParentId = targetTask.parent_task_id

      const targetIdx = sameLevel.findIndex(t => t.id === targetId)
      const insertIdx = dragOverPosition === "above" ? targetIdx : targetIdx + 1

      // Remove dragged from list, insert at position
      const reordered = sameLevel.filter(t => t.id !== draggedTaskId)
      reordered.splice(insertIdx, 0, { ...draggedTask, parent_task_id: newParentId })

      // Batch update sort_order + parent
      for (let i = 0; i < reordered.length; i++) {
        await supabase
          .from("project_tasks")
          .update({
            sort_order: i,
            parent_task_id: reordered[i].id === draggedTaskId ? newParentId : reordered[i].parent_task_id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", reordered[i].id)
      }
    }

    resetDrag()
    fetchProjects()
  }

  const resetDrag = () => {
    setDraggedTaskId(null)
    setDragOverId(null)
    setDragOverPosition(null)
  }

  // ─── Render ────────────────────────────────────────────────

  return (
    <div>
      <Header
        title="Suivi de Projets"
        subtitle="Gestion et suivi de l'avancement des projets"
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Nouveau projet
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            <span className="ml-2 text-zinc-500">Chargement des projets...</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && projects.length === 0 && (
          <div className="text-center py-12 text-zinc-500">Aucun projet pour le moment.</div>
        )}

        {projects.map(project => {
          const config = statusConfig[project.status] || statusConfig.not_started
          const StatusIcon = config.icon
          const allTasks = project.project_tasks || []
          const rootTasks = allTasks.filter(t => !t.parent_task_id).sort((a, b) => a.sort_order - b.sort_order)
          const allLeafTasks = allTasks.filter(t => {
            const hasChildren = allTasks.some(s => s.parent_task_id === t.id)
            return !hasChildren
          })
          const completedLeaf = allLeafTasks.filter(t => t.status === "done").length
          const progress = allLeafTasks.length > 0 ? Math.round((completedLeaf / allLeafTasks.length) * 100) : 0

          // Overdue tasks
          const overdueTasks = allTasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done")

          return (
            <Card key={project.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle>{project.name}</CardTitle>
                    <Badge variant={config.variant}>
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {config.label}
                    </Badge>
                    {overdueTasks.length > 0 && (
                      <Badge variant="danger" className="text-[10px]">
                        {overdueTasks.length} en retard
                      </Badge>
                    )}
                  </div>
                  <div className="text-right text-sm text-zinc-500">
                    {project.start_date && (
                      <span>
                        {new Date(project.start_date).toLocaleDateString("fr-FR")}
                        {project.target_date && (
                          <> &rarr; {new Date(project.target_date).toLocaleDateString("fr-FR")}</>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                {project.description && (
                  <p className="text-sm text-zinc-500 mt-1">{project.description}</p>
                )}
                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                    <span>{completedLeaf}/{allLeafTasks.length} tâches terminées</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100">
                    <div
                      className="h-2 rounded-full bg-zinc-900 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-1.5" onDragEnd={resetDrag}>
                  {rootTasks.map(task => {
                    const subtasks = allTasks
                      .filter(t => t.parent_task_id === task.id)
                      .sort((a, b) => a.sort_order - b.sort_order)

                    return (
                      <Fragment key={task.id}>
                        <TaskRow
                          task={task}
                          subtasks={subtasks}
                          onUpdate={updateTask}
                          onDelete={deleteTask}
                          onAddSubtask={(parentId) => {
                            setNewSubtaskParent(parentId)
                            setNewSubtaskTitle("")
                          }}
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          dragOverId={dragOverId}
                          dragOverPosition={dragOverPosition}
                        />
                        {/* Inline new subtask form */}
                        {newSubtaskParent === task.id && (
                          <div className="ml-6 flex items-center gap-2 p-2 border border-dashed border-zinc-200 rounded-lg">
                            <CornerDownRight className="h-3.5 w-3.5 text-zinc-300 flex-shrink-0" />
                            <input
                              autoFocus
                              className="flex-1 text-sm border-b border-zinc-300 bg-transparent outline-none px-1"
                              placeholder="Nouvelle sous-tâche..."
                              value={newSubtaskTitle}
                              onChange={e => setNewSubtaskTitle(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") addSubtask(task.id)
                                if (e.key === "Escape") setNewSubtaskParent(null)
                              }}
                            />
                            <Button size="sm" variant="ghost" onClick={() => addSubtask(task.id)}>
                              <Save className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setNewSubtaskParent(null)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </Fragment>
                    )
                  })}

                  {/* Add task form */}
                  {addingTo === project.id ? (
                    <div className="flex items-center gap-2 p-2 border border-dashed border-zinc-200 rounded-lg mt-2">
                      <Plus className="h-4 w-4 text-zinc-300 flex-shrink-0" />
                      <input
                        autoFocus
                        className="flex-1 text-sm border-b border-zinc-300 bg-transparent outline-none px-1"
                        placeholder="Nouvelle tâche..."
                        value={newTaskTitle[project.id] || ""}
                        onChange={e => setNewTaskTitle(prev => ({ ...prev, [project.id]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === "Enter") addTask(project.id)
                          if (e.key === "Escape") setAddingTo(null)
                        }}
                      />
                      <Button size="sm" variant="ghost" onClick={() => addTask(project.id)}>
                        <Save className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAddingTo(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingTo(project.id)}
                      className="flex items-center gap-2 w-full p-2 text-sm text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-lg transition-colors mt-1"
                    >
                      <Plus className="h-4 w-4" />
                      Ajouter une tâche
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
