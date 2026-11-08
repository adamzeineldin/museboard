import { Panel } from "@/components/ui";
import { ResumeUploadForm, type ResumeFormAction } from "@/components/resume/ResumeUploadForm";

/** Prominent prompt on /jobs for users without a resume. */
export function ResumePrompt({ action }: { action: ResumeFormAction }) {
  return (
    <Panel aria-labelledby="resume-prompt-title" className="border-2 border-accent">
      <div className="flex flex-col gap-1">
        <h2 id="resume-prompt-title">Upload your resume to see match scores</h2>
        <p className="muted">
          Inroad ranks every open role against your resume and shows which skills line up. Nothing is sent anywhere until
          you approve a campaign.
        </p>
      </div>
      <ResumeUploadForm action={action} />
    </Panel>
  );
}
