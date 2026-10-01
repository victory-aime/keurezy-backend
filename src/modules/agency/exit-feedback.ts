import { PrismaService } from '../../database/prisma.service';
import { ExitFeedbackContext } from '../../../prisma/generated/enums';
import { ExitFeedbackDto } from './dto/exit-feedback.dto';

/**
 * Enregistre le questionnaire de départ s'il a été rempli (raison ou commentaire). Ne bloque
 * jamais l'action principale : un échec est seulement remonté au journal par l'appelant.
 */
export async function recordExitFeedback(
  prisma: PrismaService,
  agencyId: string,
  context: ExitFeedbackContext,
  feedback: ExitFeedbackDto | undefined,
): Promise<void> {
  const comment = feedback?.comment?.trim() || undefined;
  if (!feedback || (!feedback.reason && !comment)) return;
  await prisma.exitFeedback.create({
    data: { agencyId, context, reason: feedback.reason, comment },
  });
}
