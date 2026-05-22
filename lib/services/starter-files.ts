import {
  renderAgents,
  renderBuildPlan,
  renderHandoffPrompt,
  renderPrd,
} from "@/lib/artifact-renderers";
import type { Project } from "@/lib/domain";

export function createStarterFiles(project: Project) {
  const appName = project.slug || "foundry-project";
  const wordmark = `+-------+\n| ${project.name.slice(0, 5).padEnd(5, " ").toUpperCase()} |\n+-------+`;

  return [
    {
      path: "README.md",
      content: `# ${project.name}\n\n${project.oneLiner}\n\n## Getting Started\n\n\`\`\`bash\npnpm install\npnpm dev\n\`\`\`\n\n## Agent Handoff\n\nRead \`PRD.md\`, \`AGENTS.md\`, and \`docs/roadmap.md\` before implementing.\n`,
    },
    {
      path: "PRD.md",
      content: renderPrd(project),
    },
    {
      path: "AGENTS.md",
      content: renderAgents(project),
    },
    {
      path: "docs/roadmap.md",
      content: renderBuildPlan(project, project.scopeLevel),
    },
    {
      path: "docs/prompts.md",
      content: `# Prompts\n\n## Codex Handoff\n\n${renderHandoffPrompt(project)}\n`,
    },
    {
      path: "docs/decisions.md",
      content: "# Decisions\n\n- Start with repo + handoff before autonomous worker execution.\n- Keep generated apps mobile-first.\n",
    },
    {
      path: "package.json",
      content: `${JSON.stringify(
        {
          name: appName,
          version: "0.1.0",
          private: true,
          type: "module",
          scripts: {
            dev: "next dev",
            build: "next build",
            lint: "eslint .",
            typecheck: "tsc --noEmit",
          },
          dependencies: {
            "@radix-ui/react-slot": "latest",
            "class-variance-authority": "latest",
            clsx: "latest",
            "lucide-react": "latest",
            next: "latest",
            react: "latest",
            "react-dom": "latest",
            "tailwind-merge": "latest",
          },
          devDependencies: {
            "@tailwindcss/postcss": "latest",
            "@types/node": "latest",
            "@types/react": "latest",
            "@types/react-dom": "latest",
            eslint: "latest",
            "eslint-config-next": "latest",
            tailwindcss: "latest",
            typescript: "latest",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "app/layout.tsx",
      content: `import type { Metadata } from "next";\nimport "./globals.css";\n\nexport const metadata: Metadata = {\n  title: ${JSON.stringify(project.name)},\n  description: ${JSON.stringify(project.oneLiner)},\n};\n\nexport default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`,
    },
    {
      path: "app/page.tsx",
      content: `import { AppShell } from "@/components/app-shell";\n\nexport default function Home() {\n  return <AppShell />;\n}\n`,
    },
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";\n\n:root {\n  --background: #fdfcfc;\n  --foreground: #201d1d;\n  --muted: #f1eeee;\n  --border: rgba(15, 0, 0, 0.12);\n}\n\n* {\n  box-sizing: border-box;\n}\n\nbody {\n  margin: 0;\n  background: var(--background);\n  color: var(--foreground);\n  font-family: "Berkeley Mono", "JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;\n}\n\nbutton, input, textarea {\n  font: inherit;\n}\n`,
    },
    {
      path: "components/app-shell.tsx",
      content: `import { Button } from "@/components/ui/button";\n\nconst sections = [\n  "[+] Capture the smallest useful idea",\n  "[+] Generate the MVP scope and PRD",\n  "[+] Hand the repo to Codex with context intact",\n];\n\nexport function AppShell() {\n  return (\n    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">\n      <nav className="flex items-center justify-between border-b border-[var(--border)] pb-4">\n        <pre className="text-xs font-bold leading-none">{${JSON.stringify(wordmark)}}</pre>\n        <Button>Start</Button>\n      </nav>\n      <section className="grid flex-1 place-items-center py-16">\n        <div className="w-full max-w-3xl">\n          <p className="text-sm font-bold">[mvp]</p>\n          <h1 className="mt-4 text-4xl font-bold leading-normal sm:text-5xl">{${JSON.stringify(project.name)}}</h1>\n          <p className="mt-6 max-w-2xl text-base leading-7 text-[#424245]">{${JSON.stringify(project.oneLiner)}}</p>\n          <div className="mt-10 grid gap-2 border-y border-[var(--border)] py-4">\n            {sections.map((section) => (\n              <p key={section} className="text-sm leading-7">{section}</p>\n            ))}\n          </div>\n        </div>\n      </section>\n    </main>\n  );\n}\n`,
    },
    {
      path: "components/ui/button.tsx",
      content: `import * as React from "react";\nimport { Slot } from "@radix-ui/react-slot";\nimport { cva, type VariantProps } from "class-variance-authority";\nimport { cn } from "@/lib/utils";\n\nconst buttonVariants = cva(\n  "inline-flex h-10 items-center justify-center rounded px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",\n  {\n    variants: {\n      variant: {\n        default: "bg-[#201d1d] text-[#fdfcfc] hover:bg-[#0f0000]",\n        secondary: "border border-[#646262] bg-[#fdfcfc] text-[#201d1d]",\n      },\n    },\n    defaultVariants: { variant: "default" },\n  },\n);\n\nexport interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {\n  asChild?: boolean;\n}\n\nexport const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, asChild = false, ...props }, ref) => {\n  const Comp = asChild ? Slot : "button";\n  return <Comp className={cn(buttonVariants({ variant, className }))} ref={ref} {...props} />;\n});\n\nButton.displayName = "Button";\n`,
    },
    {
      path: "lib/utils.ts",
      content: `import { clsx, type ClassValue } from "clsx";\nimport { twMerge } from "tailwind-merge";\n\nexport function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs));\n}\n`,
    },
    {
      path: "tsconfig.json",
      content: `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["dom", "dom.iterable", "es2022"],
            allowJs: false,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            baseUrl: ".",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "react-jsx",
            paths: { "@/*": ["./*"] },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
          exclude: ["node_modules"],
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "postcss.config.mjs",
      content: `const config = {\n  plugins: ["@tailwindcss/postcss"],\n};\n\nexport default config;\n`,
    },
  ];
}

export function createGitHubIssues(project: Project) {
  return [
    {
      title: "Build app shell and mobile layout",
      body: `Create the first usable ${project.name} shell. Follow PRD.md and keep the first screen mobile-first.`,
    },
    {
      title: "Implement core MVP workflow",
      body: "Build the main route, data model, and primary user flow described in docs/roadmap.md.",
    },
    {
      title: "Polish Codex-ready handoff",
      body: "Verify README.md, PRD.md, AGENTS.md, and docs/prompts.md contain enough context for an agent to continue safely.",
    },
  ];
}
