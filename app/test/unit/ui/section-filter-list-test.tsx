import assert from 'node:assert'
import { describe, it } from 'node:test'

import { getFilteredItems } from '../../../src/ui/lib/section-filter-list'

interface ITestItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
}

describe('SectionFilterList', () => {
  it('can preserve item order when filtering', () => {
    const items: ReadonlyArray<ITestItem> = [
      {
        id: 'root',
        text: ['project-alpha', 'project-alpha project-alpha-feature-a'],
      },
      {
        id: 'linked',
        text: [
          'project-alpha-feature-a',
          'project-alpha project-alpha-feature-a',
        ],
      },
    ]
    const rows = getFilteredItems('feature-a', items, true).map(
      row => row.item.id
    )

    assert.deepEqual(rows, ['root', 'linked'])
  })
})
