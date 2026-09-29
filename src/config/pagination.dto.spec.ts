import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAX_PAGE_SIZE, PaginationDto } from './pagination.dto';

const errorsFor = (limitPerPage: unknown) =>
  validate(plainToInstance(PaginationDto, { limitPerPage }));

describe('PaginationDto', () => {
  it(`accepte une page de ${MAX_PAGE_SIZE} éléments`, async () => {
    expect(await errorsFor(String(MAX_PAGE_SIZE))).toHaveLength(0);
  });

  it(`refuse une page de plus de ${MAX_PAGE_SIZE} éléments`, async () => {
    expect(await errorsFor(String(MAX_PAGE_SIZE + 1))).not.toHaveLength(0);
  });

  it('refuse une taille nulle ou négative', async () => {
    expect(await errorsFor('0')).not.toHaveLength(0);
  });
});
