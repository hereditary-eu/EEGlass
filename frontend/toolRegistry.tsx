export interface ToolDefinition {
  id: string;
  title: string;
  description: string;
  route: string;
  appUrl: string;
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    id: "clusters-in-focus",
    title: "Clusters in Focus",
    description:
      "this is a description of the Clusters in Focus tool",
    route: "/tools/clusters-in-focus",
    appUrl: "/tool-apps/clusters-in-focus",
  },
  {
    id: "neurodegen-vis",
    title: "NeurodegenVis",
    description:
      "this is a description of the NeurodegenVis tool",
    route: "/tools/neurodegen-vis",
    appUrl: "/tool-apps/neurodegen-vis",
  },
];
