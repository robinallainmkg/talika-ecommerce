"use client"

import { Header } from "@/components/layout/header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { mockProjects } from "@/lib/mock-data"
import { Plus, CheckCircle2, Circle, Clock, Pause } from "lucide-react"

const statusConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "info"; icon: typeof Circle }> = {
  not_started: { label: "Non démarré", variant: "default", icon: Circle },
  in_progress: { label: "En cours", variant: "info", icon: Clock },
  on_hold: { label: "En pause", variant: "warning", icon: Pause },
  completed: { label: "Terminé", variant: "success", icon: CheckCircle2 },
}

const priorityColors: Record<string, "default" | "warning" | "danger" | "info"> = {
  low: "default",
  medium: "info",
  high: "warning",
  critical: "danger",
}

export default function ProjectsPage() {
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
        {/* Project cards */}
        {mockProjects.map((project) => {
          const config = statusConfig[project.status]
          const StatusIcon = config.icon
          const completedTasks = project.tasks.filter(
            (t) => t.status === "completed"
          ).length

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
                    {project.startDate && (
                      <span>
                        {new Date(project.startDate).toLocaleDateString("fr-FR")}
                        {project.endDate && (
                          <> → {new Date(project.endDate).toLocaleDateString("fr-FR")}</>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-zinc-500 mt-1">{project.description}</p>
                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                    <span>
                      {completedTasks}/{project.tasks.length} tâches
                    </span>
                    <span>{project.progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100">
                    <div
                      className="h-2 rounded-full bg-zinc-900 transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>
              </CardHeader>
              {project.tasks.length > 0 && (
                <CardContent>
                  <div className="space-y-2">
                    {project.tasks.map((task) => {
                      const taskConfig = statusConfig[task.status]
                      const TaskIcon = taskConfig.icon
                      return (
                        <div
                          key={task.id}
                          className="flex items-center justify-between rounded-lg border border-zinc-100 p-3 hover:bg-zinc-50"
                        >
                          <div className="flex items-center gap-3">
                            <TaskIcon
                              className={`h-4 w-4 ${
                                task.status === "completed"
                                  ? "text-emerald-500"
                                  : task.status === "in_progress"
                                  ? "text-blue-500"
                                  : "text-zinc-300"
                              }`}
                            />
                            <span
                              className={`text-sm ${
                                task.status === "completed"
                                  ? "text-zinc-400 line-through"
                                  : "text-zinc-900"
                              }`}
                            >
                              {task.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {task.assignee && (
                              <span className="text-xs text-zinc-400">{task.assignee}</span>
                            )}
                            <Badge variant={priorityColors[task.priority]}>
                              {task.priority}
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
