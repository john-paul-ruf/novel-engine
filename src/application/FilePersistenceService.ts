import type { IFileSystemService } from '@domain/interfaces';
import type { PipelinePhaseId } from '@domain/types';
import { AGENT_OUTPUT_TARGETS } from '@domain/constants';

export class FilePersistenceService {
  constructor(private fs: IFileSystemService) {}

  async saveAgentOutput(params: {
    bookSlug: string;
    pipelinePhase: PipelinePhaseId;
    targetPath: string;
    content: string;
    chapterSlug?: string;
  }): Promise<{ savedPath: string }> {
    const { bookSlug, pipelinePhase, targetPath, content, chapterSlug } = params;

    // 1. Validate that targetPath is a known target for the given phase
    const targets = AGENT_OUTPUT_TARGETS[pipelinePhase];
    if (!targets) {
      throw new Error(`No output targets defined for pipeline phase "${pipelinePhase}"`);
    }

    const target = targets.find((t) => t.targetPath === targetPath);
    if (!target) {
      throw new Error(
        `Target path "${targetPath}" is not a valid output target for phase "${pipelinePhase}". ` +
        `Valid targets: ${targets.map((t) => t.targetPath).join(', ')}`,
      );
    }

    // 2. Resolve chapter slug if needed
    let resolvedPath = targetPath;
    if (target.isChapter) {
      if (!chapterSlug) {
        throw new Error(
          `Chapter slug is required for target "${targetPath}" in phase "${pipelinePhase}"`,
        );
      }
      resolvedPath = targetPath.replace('{slug}', chapterSlug);
    }

    // 3. Version archiving for second-read and second-assessment
    if (pipelinePhase === 'second-read' && resolvedPath === 'source/reader-report.md') {
      const exists = await this.fs.fileExists(bookSlug, 'source/reader-report.md');
      if (exists) {
        await this.fs.renameFile(bookSlug, 'source/reader-report.md', 'source/reader-report-v1.md');
      }
    }

    if (pipelinePhase === 'second-assessment' && resolvedPath === 'source/dev-report.md') {
      const exists = await this.fs.fileExists(bookSlug, 'source/dev-report.md');
      if (exists) {
        await this.fs.renameFile(bookSlug, 'source/dev-report.md', 'source/dev-report-v1.md');
      }
    }

    // 4. Write the content
    await this.fs.writeFile(bookSlug, resolvedPath, content);

    // 5. Return the resolved path
    return { savedPath: resolvedPath };
  }
}
