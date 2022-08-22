import { LensHubProxy } from '@abis/LensHubProxy'
import { useMutation } from '@apollo/client'
import { GridItemEight, GridItemFour, GridLayout } from '@components/GridLayout'
import { CREATE_POST_TYPED_DATA_MUTATION } from '@components/Publication/NewPost'
import ChooseFile from '@components/Shared/ChooseFile'
import Pending from '@components/Shared/Pending'
import SettingsHelper from '@components/Shared/SettingsHelper'
import { Button } from '@components/UI/Button'
import { Card } from '@components/UI/Card'
import { Form, useZodForm } from '@components/UI/Form'
import { Input } from '@components/UI/Input'
import { Spinner } from '@components/UI/Spinner'
import { TextArea } from '@components/UI/TextArea'
import Seo from '@components/utils/Seo'
import { CreatePostBroadcastItemResult } from '@generated/types'
import { BROADCAST_MUTATION } from '@gql/BroadcastMutation'
import { PlusIcon } from '@heroicons/react/outline'
import { Mixpanel } from '@lib/mixpanel'
import omit from '@lib/omit'
import splitSignature from '@lib/splitSignature'
import uploadMediaToIPFS from '@lib/uploadMediaToIPFS'
import uploadToArweave from '@lib/uploadToArweave'
import { NextPage } from 'next'
import React, { ChangeEvent, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { APP_NAME, CONNECT_WALLET, ERROR_MESSAGE, ERRORS, LENSHUB_PROXY, RELAY_ON } from 'src/constants'
import Custom404 from 'src/pages/404'
import { useAppPersistStore, useAppStore } from 'src/store/app'
import { GROUP } from 'src/tracking'
import { v4 as uuid } from 'uuid'
import { useContractWrite, useSignTypedData } from 'wagmi'
import { object, string } from 'zod'

const Create: NextPage = () => {
  const { t } = useTranslation('common')
  const userSigNonce = useAppStore((state) => state.userSigNonce)
  const setUserSigNonce = useAppStore((state) => state.setUserSigNonce)
  const isAuthenticated = useAppPersistStore((state) => state.isAuthenticated)
  const currentUser = useAppPersistStore((state) => state.currentUser)
  const [avatar, setAvatar] = useState<string>()
  const [avatarType, setAvatarType] = useState<string>()
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [uploading, setUploading] = useState<boolean>(false)
  const { isLoading: signLoading, signTypedDataAsync } = useSignTypedData({
    onError(error) {
      toast.error(error?.message)
    }
  })

  const newGroupSchema = object({
    name: string()
      .min(2, { message: 'Name should be atleast 2 characters' })
      .max(31, { message: 'Name should be less than 32 characters' }),
    description: string().max(260, { message: 'Description should not exceed 260 characters' }).nullable()
  })

  const onCompleted = () => {
    Mixpanel.track(GROUP.NEW, { result: 'success' })
  }

  const {
    data,
    isLoading: writeLoading,
    write
  } = useContractWrite({
    addressOrName: LENSHUB_PROXY,
    contractInterface: LensHubProxy,
    functionName: 'postWithSig',
    mode: 'recklesslyUnprepared',
    onSuccess() {
      onCompleted()
    },
    onError(error: any) {
      toast.error(error?.data?.message ?? error?.message)
    }
  })

  const form = useZodForm({
    schema: newGroupSchema
  })

  const handleUpload = async (evt: ChangeEvent<HTMLInputElement>) => {
    evt.preventDefault()
    setUploading(true)
    try {
      const attachment = await uploadMediaToIPFS(evt.target.files)
      if (attachment[0]?.item) {
        setAvatar(attachment[0].item)
        setAvatarType(attachment[0].type)
      }
    } finally {
      setUploading(false)
    }
  }

  const [broadcast, { data: broadcastData, loading: broadcastLoading }] = useMutation(BROADCAST_MUTATION, {
    onCompleted,
    onError(error) {
      if (error.message === ERRORS.notMined) {
        toast.error(error.message)
      }
      Mixpanel.track(GROUP.NEW, { result: 'broadcast_error' })
    }
  })
  const [createPostTypedData, { loading: typedDataLoading }] = useMutation(CREATE_POST_TYPED_DATA_MUTATION, {
    async onCompleted({ createPostTypedData }: { createPostTypedData: CreatePostBroadcastItemResult }) {
      const { id, typedData } = createPostTypedData
      const {
        profileId,
        contentURI,
        collectModule,
        collectModuleInitData,
        referenceModule,
        referenceModuleInitData,
        deadline
      } = typedData?.value

      try {
        const signature = await signTypedDataAsync({
          domain: omit(typedData?.domain, '__typename'),
          types: omit(typedData?.types, '__typename'),
          value: omit(typedData?.value, '__typename')
        })
        setUserSigNonce(userSigNonce + 1)
        const { v, r, s } = splitSignature(signature)
        const sig = { v, r, s, deadline }
        const inputStruct = {
          profileId,
          contentURI,
          collectModule,
          collectModuleInitData,
          referenceModule,
          referenceModuleInitData,
          sig
        }
        if (RELAY_ON) {
          const {
            data: { broadcast: result }
          } = await broadcast({ variables: { request: { id, signature } } })

          if ('reason' in result) write?.({ recklesslySetUnpreparedArgs: inputStruct })
        } else {
          write?.({ recklesslySetUnpreparedArgs: inputStruct })
        }
      } catch (error) {}
    },
    onError(error) {
      toast.error(error.message ?? ERROR_MESSAGE)
    }
  })

  const createGroup = async (name: string, description: string | null) => {
    if (!isAuthenticated) return toast.error(CONNECT_WALLET)

    setIsUploading(true)
    const id = await uploadToArweave({
      version: '2.0.0',
      metadata_id: uuid(),
      description: description,
      content: description,
      external_url: null,
      image: avatar ? avatar : `https://avatar.tobi.sh/${uuid()}.png`,
      imageMimeType: avatarType,
      name: name,
      contentWarning: null, // TODO
      attributes: [
        {
          traitType: 'string',
          key: 'type',
          value: 'group'
        }
      ],
      media: [],
      locale: 'en',
      createdOn: new Date(),
      appId: `${APP_NAME} Group`
    }).finally(() => setIsUploading(false))

    createPostTypedData({
      variables: {
        options: { overrideSigNonce: userSigNonce },
        request: {
          profileId: currentUser?.id,
          contentURI: `https://arweave.net/${id}`,
          collectModule: {
            freeCollectModule: {
              followerOnly: false
            }
          },
          referenceModule: {
            followerOnlyReferenceModule: false
          }
        }
      }
    })
  }

  if (!isAuthenticated) return <Custom404 />

  return (
    <GridLayout>
      <Seo title={`Create Group • ${APP_NAME}`} />
      <GridItemFour>
        <SettingsHelper heading={t('Create group')} description={t('Create group description')} />
      </GridItemFour>
      <GridItemEight>
        <Card>
          {data?.hash ?? broadcastData?.broadcast?.txHash ? (
            <Pending
              txHash={data?.hash ? data?.hash : broadcastData?.broadcast?.txHash}
              indexing={t('Group creation load')}
              indexed={t('Group created successfully')}
              type="group"
              urlPrefix="groups"
            />
          ) : (
            <Form
              form={form}
              className="p-5 space-y-4"
              onSubmit={({ name, description }) => {
                createGroup(name, description)
              }}
            >
              <Input label={t('Group name')} type="text" placeholder="minecraft" {...form.register('name')} />
              <TextArea
                label={t('Group description')}
                placeholder={t('Group description placeholder')}
                {...form.register('description')}
              />
              <div className="space-y-1.5">
                <div className="label">{t('Avatar')}</div>
                <div className="space-y-3">
                  {avatar && (
                    <img
                      className="w-60 h-60 rounded-lg"
                      height={240}
                      width={240}
                      src={avatar}
                      alt={avatar}
                    />
                  )}
                  <div className="flex items-center space-x-3">
                    <ChooseFile
                      id="avatar"
                      onChange={(evt: ChangeEvent<HTMLInputElement>) => handleUpload(evt)}
                    />
                    {uploading && <Spinner size="sm" />}
                  </div>
                </div>
              </div>
              <Button
                className="ml-auto"
                type="submit"
                disabled={typedDataLoading || isUploading || signLoading || writeLoading || broadcastLoading}
                icon={
                  typedDataLoading || isUploading || signLoading || writeLoading || broadcastLoading ? (
                    <Spinner size="xs" />
                  ) : (
                    <PlusIcon className="w-4 h-4" />
                  )
                }
              >
                {t('Create')}
              </Button>
            </Form>
          )}
        </Card>
      </GridItemEight>
    </GridLayout>
  )
}

export default Create
