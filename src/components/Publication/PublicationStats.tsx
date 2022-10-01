import Collectors from '@components/Shared/Modal/Collectors'
import Likes from '@components/Shared/Modal/Likes'
import Mirrors from '@components/Shared/Modal/Mirrors'
import { Modal } from '@components/UI/Modal'
import { BCharityPublication } from '@generated/bcharitytypes'
import { CollectionIcon, HeartIcon, SwitchHorizontalIcon } from '@heroicons/react/outline'
import { Mixpanel } from '@lib/mixpanel'
import nFormatter from '@lib/nFormatter'
import React, { FC, useState } from 'react'
import { PUBLICATION } from 'src/tracking'

interface Props {
  publication: BCharityPublication
}

const PublicationStats: FC<Props> = ({ publication }) => {
  const [showMirrorsModal, setShowMirrorsModal] = useState(false)
  const [showLikesModal, setShowLikesModal] = useState(false)
  const [showCollectorsModal, setShowCollectorsModal] = useState(false)

  const isMirror = publication.__typename === 'Mirror'
  const mirrorCount = isMirror
    ? publication?.mirrorOf?.stats?.totalAmountOfMirrors
    : publication?.stats?.totalAmountOfMirrors
  const reactionCount = isMirror
    ? publication?.mirrorOf?.stats?.totalUpvotes
    : publication?.stats?.totalUpvotes
  const collectCount = isMirror
    ? publication?.mirrorOf?.stats?.totalAmountOfCollects
    : publication?.stats?.totalAmountOfCollects
  const publicationId = isMirror ? publication?.mirrorOf?.id : publication?.id

  return (
    <div className="flex flex-wrap gap-6 text-sm items-center py-3 text-gray-500 sm:gap-8">
      {mirrorCount > 0 && (
        <>
          <button
            onClick={() => {
              setShowMirrorsModal(true)
              Mixpanel.track(PUBLICATION.STATS.MIRRORED_BY)
            }}
          >
            <b className="text-black dark:text-white">{nFormatter(mirrorCount)}</b> Mirrors
          </button>
          <Modal
            title="Mirrored by"
            icon={<SwitchHorizontalIcon className="w-5 h-5 text-brand" />}
            show={showMirrorsModal}
            onClose={() => setShowMirrorsModal(false)}
          >
            <Mirrors publicationId={publicationId} />
          </Modal>
        </>
      )}
      {reactionCount > 0 && (
        <>
          <button
            onClick={() => {
              setShowLikesModal(true)
              Mixpanel.track(PUBLICATION.STATS.LIKED_BY)
            }}
          >
            <b className="text-black dark:text-white">{nFormatter(reactionCount)}</b> Likes
          </button>
          <Modal
            title="Liked by"
            icon={<HeartIcon className="w-5 h-5 text-brand" />}
            show={showLikesModal}
            onClose={() => setShowLikesModal(false)}
          >
            <Likes publicationId={publicationId} />
          </Modal>
        </>
      )}
      {collectCount > 0 && (
        <>
          <button
            onClick={() => {
              setShowCollectorsModal(true)
              Mixpanel.track(PUBLICATION.STATS.COLLECTED_BY)
            }}
          >
            <b className="text-black dark:text-white">{nFormatter(collectCount)}</b> Collects
          </button>
          <Modal
            title="Collected by"
            icon={<CollectionIcon className="w-5 h-5 text-brand" />}
            show={showCollectorsModal}
            onClose={() => setShowCollectorsModal(false)}
          >
            <Collectors publicationId={publicationId} />
          </Modal>
        </>
      )}
    </div>
  )
}

export default PublicationStats
