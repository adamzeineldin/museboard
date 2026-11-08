import type { Metadata } from "next";
import { formatRelative } from "@/components/shell/format";
import { ResumeList } from "@/components/resume/ResumeList";
import { ResumeUploadForm } from "@/components/resume/ResumeUploadForm";
import { Button, EmptyState, Panel } from "@/components/ui";
import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/current-user";
import { listResumes, resumeDownloadPath } from "@/lib/resume";
import { deleteResumeAction, setDefaultResumeAction, uploadResumeAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

async function signOutAction(): Promise<void> {
  "use server";
  await signOut({ redirectTo: "/signin" });
}

const wordCount = (text: string): number => (text.trim() ? text.trim().split(/\s+/).length : 0);

// Profile, resumes and sign out. Milestone 7 adds the Muse connector section.
export default async function SettingsPage() {
  const user = await requireUser();
  const resumes = await listResumes(user.id);
  const now = new Date();
  const items = resumes.map((resume) => ({
    id: resume.id,
    filename: resume.filename,
    isDefault: resume.isDefault,
    uploadedLabel: formatRelative(resume.createdAt, now),
    wordCount: wordCount(resume.parsedText),
    downloadHref: resumeDownloadPath(resume.id),
  }));

  return (
    <>
      <div className="head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Your profile, resumes and account.</p>
        </div>
      </div>

      <Panel aria-labelledby="resumes-title">
        <div className="flex flex-col gap-1">
          <h2 id="resumes-title">Resumes</h2>
          <p className="muted">
            Jobs are ranked against your default resume. Your campaign names the resume it sends, so changing the default
            doesn&apos;t change an approved campaign.
          </p>
        </div>
        {items.length === 0 ? (
          <EmptyState title="No resume yet" framed={false}>
            Upload one to see match scores on the Jobs page.
          </EmptyState>
        ) : (
          <ResumeList resumes={items} setDefaultAction={setDefaultResumeAction} deleteAction={deleteResumeAction} />
        )}
        <ResumeUploadForm action={uploadResumeAction} submitLabel={items.length ? "Upload another" : "Upload resume"} />
      </Panel>

      <Panel aria-labelledby="profile-title">
        <h2 id="profile-title" className="label">
          Profile
        </h2>
        <p>
          <b>{user.name}</b> · {user.school}, class of {user.gradYear}
        </p>
        <p className="muted">
          {user.email} · {user.timezone.replace(/_/g, " ")}
        </p>
        <form action={signOutAction}>
          <Button type="submit">Sign out</Button>
        </form>
      </Panel>
    </>
  );
}
