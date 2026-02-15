"use client";

import { handleError } from "@repo/design-system/lib/handle-error";
import type { EditorInstance, JSONContent } from "@repo/editor";
import dynamic from "next/dynamic";
import { updateProposalPrd } from "@/actions/proposals/update-prd";
import { staticify } from "@/lib/staticify";

type PrdEditorProps = {
  readonly proposalId: string;
  readonly defaultValue: JSONContent;
};

const Editor = dynamic(
  async () => {
    const Module = await import(
      /* webpackChunkName: "editor" */
      "@/components/editor"
    );
    return Module.Editor;
  },
  { ssr: false }
);

export const PrdEditor = ({ proposalId, defaultValue }: PrdEditorProps) => {
  const handleDebouncedUpdate = async (editor?: EditorInstance | undefined) => {
    if (!editor) {
      return;
    }

    const json = editor.getJSON();
    const content = staticify(json);

    try {
      await updateProposalPrd(proposalId, content);
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <Editor
      defaultValue={defaultValue}
      editable
      onDebouncedUpdate={handleDebouncedUpdate}
    />
  );
};
