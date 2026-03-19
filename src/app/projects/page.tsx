"use client"

import { useEffect, useState } from "react"
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
} from "lucide-react"

interface ProjectTask {
  id: string
  title: string
  status: "todo" | "in_progress" | "blocked" | "done"
  priority: "low" | "medium" | "high" | "critical"
  assignee?: string | null
}

interface Project {
  id: string
  name: string
  description: string | null
  status: string
  start_date: string | null
  end_date: string | null
  created_at: string
  project_tasks: ProjectTask[]
}

const statusConfig: Record<
  string,
  {
    label: string
    variant: "default" | "success" | "warning" | "info" | "danger"
    icon: typeof Circle
  }
> = {
  not_started: { label: "Non demarré", variant: "default", icon: Circle },
  in_progress: { label: "En cours", variant: "info", icon: Clock },
  on_hold: { label: "En pause", variant: "warning", icon: AlertTriangle },
  completed: { label: "Terminé", variant: "success", icon: CheckCircle2 },
}

const taskStatusConfig: Record<
  string,
  { label: string; icon: typeof Circle; colorClass: string }
> = {
  todo: { label: "A faire", icon: Circle, colorClass: "text-zinc-300" },
  in_progress: { label: "En cours", icon: Clock, colorClass: "text-blue-500" },
  blocked: {
    label: "Bloqué",
    icon: AlertTriangle,
    colorClass: "text-red-500",
  },
  done: {
    label: "Terminé",
    icon: CheckCircle2,
    colorClass: "text-emerald-500",
  },
}

const priorityColors: Record<
  string,
  "default" | "info" | "warning" | "danger"
> = {
  low: "default",
  medium: "info",
  high: "warning",
  critical: "danger",
}

const priorityLabels: Record<string, string> = {
  low: "Faible",
  medium: "Moyen",
  high: "Haute",
  critical: "Critique",
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProjects() {
      try {
        const { data, error } = await supabase
          .from("projects")
          .select(`*, project_tasks (*)`)
          .order("created_at", { ascending: false })

        if (error) throw error
        setProjects(data || [])
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erreur lors du chargement"
        )
      } finally {
        setLoading(false)
      }
    }
    fetchProjects()
  }, [])

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
            <span className="ml-2 text-zinc-500">
              Chargement des projets...
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && projects.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            Aucun projet pour le moment.
          </div>
        )}

        {projects.map((project) => {
          const config = statusConfig[project.status] || statusConfig.not_started
          const StatusIcon = config.icon
          const tasks = project.project_tasks || []
          const completedTasks = tasks.filter((t) => t.status === "done").length
          const progress =
            tasks.length > 0
              ? Math.round((completedTasks / tasks.length) * 100)
              : 0

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
                  </div>
                  <div className="text-right text-sm text-zinc-500">
                    {project.start_date && (
                      <span>
                        {new Date(project.start_date).toLocaleDateString(
                          "fr-FR"
                        )}
                        {project.end_date && (
                          <>
                            {" "}
                            &rarr;{" "}
                            {new Date(project.end_date).toLocaleDateString(
                              "fr-FR"
                            )}
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                {project.description && (
                  <p className="text-sm text-zinc-500 mt-1">
                    {project.description}
                  </p>
                )}
                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                    <span>
                      {completedTasks}/{tasks.length} tâches
                    </span>
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
              {tasks.length > 0 && (
                <CardContent>
                  <div className="space-y-2">
                    {tasks.map((task) => {
                      const tc =
                        taskStatusConfig[task.status] || taskStatusConfig.todo
                      const TaskIcon = tc.icon
                      return (
                        <div
                          key={task.id}
                          className="flex items-center justify-between rounded-lg border border-zinc-100 p-3 hover:bg-zinc-50"
                        >
                          <div className="flex items-center gap-3">
                            <TaskIcon className={`h-4 w-4 ${tc.colorClass}`} />
                            <span
                              className={`text-sm ${
                                task.status === "done"
                                  ? "text-zinc-400 line-through"
                                  : "text-zinc-900"
                              }`}
                            >
                              {task.title}
                            </span>
                            <Badge
                              variant={
                                task.status === "blocked" ? "danger" : "default"
                              }
                              className="text-[10px]"
                            >
                              {tc.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {task.assignee && (
                              <span className="text-xs text-zinc-400">
                                {task.assignee}
                              </span>
                            )}
                            <Badge variant={priorityColors[task.priority]}>
                              {priorityLabels[task.priority] || task.priority}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
