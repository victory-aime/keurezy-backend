-- Contraction (section 30 de CHANGES.md) : plus aucun mot de passe temporaire d'invitation n'est
-- généré, stocké ni envoyé ; la colonne n'est plus lue ni écrite par le code.
-- À déployer APRÈS le code qui n'écrit plus la colonne (sinon, pendant le déploiement, l'ancien
-- code échouerait à l'acceptation et à l'annulation d'une invitation).

-- AlterTable
ALTER TABLE "invitation" DROP COLUMN "temporaryPassword";
