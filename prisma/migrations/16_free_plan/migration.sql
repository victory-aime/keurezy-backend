-- Plan Gratuit, entrée de gamme du modèle par abonnement (décisions du 2026-10-01).
-- Seule la valeur d'enum est ajoutée ici : Postgres ne permet pas de l'utiliser dans la même
-- transaction. Le plan lui-même est créé par le seed (`db:seed:*-feature`).

-- AlterEnum
ALTER TYPE "Plan" ADD VALUE 'FREE_SUB' BEFORE 'BASIC_SUB';
