export interface DatabaseHealthRepository {
  ping(): Promise<void>
}
